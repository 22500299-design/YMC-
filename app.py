import http.server
import socketserver
import json
import urllib.parse
import os
import uuid
import shutil
import email
import email.message
import sys
import datetime
from db import init_db, get_db_connection

PORT = int(os.environ.get('PORT', 8000))
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

class YMCApiHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS for easy testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Revalidate frontend files so a new HTML file is never mixed with stale JS/CSS.
        request_path = urllib.parse.urlparse(self.path).path
        if request_path == '/' or request_path.endswith(('.html', '.js', '.css')):
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # Serve static assets or route requests
        if path.startswith('/api/'):
            self.handle_api_get(path, query_params)
        elif path.startswith('/uploads/'):
            # Serve files from uploads folder
            file_relative = path[9:] # remove '/uploads/'
            file_path = os.path.join(UPLOAD_DIR, urllib.parse.unquote(file_relative))
            if os.path.exists(file_path) and os.path.isfile(file_path):
                self.send_response(200)
                # Guess content type
                if file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                    self.send_header('Content-type', 'image/' + file_path.split('.')[-1])
                elif file_path.lower().endswith('.pdf'):
                    self.send_header('Content-type', 'application/pdf')
                else:
                    self.send_header('Content-type', 'application/octet-stream')
                
                # Check size
                stat = os.stat(file_path)
                self.send_header('Content-Length', str(stat.st_size))
                self.end_headers()
                with open(file_path, 'rb') as f:
                    shutil.copyfileobj(f, self.wfile)
            else:
                self.send_error(404, "File not found")
        else:
            # SPA fallback: if file does not exist, serve index.html
            local_path = self.translate_path(path)
            if not os.path.exists(local_path) or os.path.isdir(local_path):
                self.path = '/index.html'
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == '/api/expenditures/upload':
            self.handle_receipt_upload()
            return

        if path.startswith('/api/'):
            # Read JSON body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self.send_error_response(400, "Invalid JSON body")
                return
            
            self.handle_api_post(path, data)
        else:
            self.send_error(404, "Not Found")

    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self.send_error_response(400, "Invalid JSON body")
                return

            self.handle_api_put(path, data)
        else:
            self.send_error(404, "Not Found")

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        if path.startswith('/api/'):
            self.handle_api_delete(path, query_params)
        else:
            self.send_error(404, "Not Found")

    # --- GET API Handlers ---
    def handle_api_get(self, path, query):
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            if path == '/api/events':
                # Get all events with settlement state
                cursor.execute("SELECT id, name, month, is_settled, settled_date, settlement_notes FROM event_master ORDER BY id ASC")
                events = [dict(row) for row in cursor.fetchall()]
                self.send_json_response(200, events)
            
            elif path == '/api/income':
                # Get all income records with event name
                cursor.execute("""
                    SELECT i.*, e.name as event_name 
                    FROM income_management i
                    LEFT JOIN event_master e ON i.event_id = e.id
                    ORDER BY i.id DESC
                """)
                income = [dict(row) for row in cursor.fetchall()]
                self.send_json_response(200, income)

            elif path == '/api/expenditures':
                # Get all expenditures with event name
                cursor.execute("""
                    SELECT ex.*, e.name as event_name 
                    FROM expenditure_receipt ex
                    LEFT JOIN event_master e ON ex.event_id = e.id
                    ORDER BY ex.id DESC
                """)
                expenditures = [dict(row) for row in cursor.fetchall()]
                self.send_json_response(200, expenditures)
            
            elif path == '/api/budgets':
                # Get all budget planning records
                event_id_filter = query.get('event_id')
                if event_id_filter:
                    cursor.execute("""
                        SELECT b.*, e.name as event_name 
                        FROM budget_planning b
                        LEFT JOIN event_master e ON b.event_id = e.id
                        WHERE b.event_id = ?
                        ORDER BY b.id ASC
                    """, (int(event_id_filter[0]),))
                else:
                    cursor.execute("""
                        SELECT b.*, e.name as event_name 
                        FROM budget_planning b
                        LEFT JOIN event_master e ON b.event_id = e.id
                        ORDER BY b.id ASC
                    """)
                budgets = [dict(row) for row in cursor.fetchall()]
                self.send_json_response(200, budgets)

            elif path == '/api/settlements/compare':
                # Compare budget vs actual per event
                cursor.execute("""
                    SELECT 
                        e.id, 
                        e.name, 
                        e.month, 
                        e.is_settled, 
                        e.settled_date, 
                        e.settlement_notes,
                        COALESCE((SELECT SUM(amount) FROM budget_planning WHERE event_id = e.id AND type = '수입'), 0) as planned_income,
                        COALESCE((SELECT SUM(amount) FROM income_management WHERE event_id = e.id), 0) as actual_income,
                        COALESCE((SELECT SUM(amount) FROM budget_planning WHERE event_id = e.id AND type = '지출'), 0) as planned_expenditure,
                        COALESCE((SELECT SUM(amount) FROM expenditure_receipt WHERE event_id = e.id), 0) as actual_expenditure
                    FROM event_master e
                    ORDER BY e.id ASC
                """)
                comparison = [dict(row) for row in cursor.fetchall()]
                self.send_json_response(200, comparison)

            elif path == '/api/dashboard/stats':
                # Return general dashboard metrics
                cursor.execute("SELECT SUM(amount) FROM income_management")
                total_income = cursor.fetchone()[0] or 0
                
                cursor.execute("SELECT SUM(amount) FROM expenditure_receipt")
                total_expenditure = cursor.fetchone()[0] or 0
                
                cursor.execute("SELECT COUNT(*) FROM expenditure_receipt WHERE status = '승인 대기'")
                pending_receipts = cursor.fetchone()[0] or 0

                cursor.execute("""
                    SELECT e.name as event_name, 
                           COALESCE((SELECT SUM(amount) FROM income_management WHERE event_id = e.id), 0) as income_sum,
                           COALESCE((SELECT SUM(amount) FROM expenditure_receipt WHERE event_id = e.id), 0) as expenditure_sum
                    FROM event_master e
                """)
                event_summaries = [dict(row) for row in cursor.fetchall()]

                self.send_json_response(200, {
                    'total_income': total_income,
                    'total_expenditure': total_expenditure,
                    'balance': total_income - total_expenditure,
                    'pending_receipts': pending_receipts,
                    'event_summaries': event_summaries
                })

            elif path == '/api/dues/items':
                # Get fee items with calculated statistics
                cursor.execute("""
                    SELECT fi.id, fi.title, fi.type, fi.event_id, fi.target_amount, fi.due_date, fi.description, fi.created_at,
                           MAX(e.name) as event_name,
                           COUNT(fp.id) as total_members,
                           COALESCE(SUM(CASE WHEN fp.status = '납부 완료' THEN 1 ELSE 0 END), 0) as paid_members,
                           COALESCE(SUM(CASE WHEN fp.status = '미납' THEN 1 ELSE 0 END), 0) as unpaid_members,
                           COALESCE(SUM(CASE WHEN fp.status = '면제' THEN 1 ELSE 0 END), 0) as exempt_members,
                           COALESCE(SUM(fp.paid_amount), 0) as total_paid_amount
                    FROM fee_items fi
                    LEFT JOIN event_master e ON fi.event_id = e.id
                    LEFT JOIN fee_payments fp ON fi.id = fp.fee_item_id
                    GROUP BY fi.id, fi.title, fi.type, fi.event_id, fi.target_amount, fi.due_date, fi.description, fi.created_at
                    ORDER BY fi.id ASC
                """)
                rows = cursor.fetchall()
                fee_items = []
                for row in rows:
                    item = dict(row)
                    total_m = item['total_members'] or 0
                    paid_m = item['paid_members'] or 0
                    target_amount = item['target_amount'] or 0
                    item['target_total_amount'] = total_m * target_amount
                    item['rate'] = round((paid_m / total_m * 100), 1) if total_m > 0 else 0.0
                    fee_items.append(item)
                self.send_json_response(200, fee_items)

            elif path == '/api/dues/payments':
                fee_item_id = query.get('fee_item_id')
                if fee_item_id:
                    cursor.execute("""
                        SELECT fp.*, fi.title as fee_title, fi.target_amount as item_target_amount
                        FROM fee_payments fp
                        JOIN fee_items fi ON fp.fee_item_id = fi.id
                        WHERE fp.fee_item_id = ?
                        ORDER BY fp.id ASC
                    """, (int(fee_item_id[0]),))
                else:
                    cursor.execute("""
                        SELECT fp.*, fi.title as fee_title, fi.target_amount as item_target_amount
                        FROM fee_payments fp
                        JOIN fee_items fi ON fp.fee_item_id = fi.id
                        ORDER BY fp.id DESC
                    """)
                payments = [dict(row) for row in cursor.fetchall()]
                self.send_json_response(200, payments)

            else:
                self.send_error_response(404, "API endpoint not found")
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    # --- POST API Handlers ---
    def handle_api_post(self, path, data):
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            if path == '/api/events':
                name = data.get('name')
                month = data.get('month')
                if not name:
                    self.send_error_response(400, "행사명은 필수입니다.")
                    return
                cursor.execute("INSERT INTO event_master (name, month) VALUES (?, ?)", (name, month))
                conn.commit()
                new_id = cursor.lastrowid
                self.send_json_response(201, {'id': new_id, 'name': name, 'month': month})

            elif path == '/api/income':
                category = data.get('category')
                event_id = data.get('event_id')
                description = data.get('description')
                amount = data.get('amount')
                basis = data.get('basis')
                remarks = data.get('remarks')
                transaction_date = data.get('transaction_date')
                payer_name = data.get('payer_name')

                if not category or not description or amount is None:
                    self.send_error_response(400, "분류, 내역, 금액은 필수입니다.")
                    return
                
                cursor.execute("""
                    INSERT INTO income_management (category, event_id, description, amount, basis, remarks, transaction_date, payer_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (category, event_id, description, int(amount), basis, remarks, transaction_date, payer_name))
                conn.commit()
                self.send_json_response(201, {'id': cursor.lastrowid, 'status': 'success'})

            elif path == '/api/expenditures':
                category = data.get('category')
                event_id = data.get('event_id')
                description = data.get('description')
                amount = data.get('amount')
                basis = data.get('basis')
                receipt_path = data.get('receipt_path')
                submitter = data.get('submitter')
                status = data.get('status', '승인 대기')
                transaction_date = data.get('transaction_date')
                withdrawer_name = data.get('withdrawer_name') or submitter

                if not category or not description or amount is None or not submitter:
                    self.send_error_response(400, "분류, 내역, 금액, 제출자는 필수입니다.")
                    return

                cursor.execute("""
                    INSERT INTO expenditure_receipt (category, event_id, description, amount, basis, receipt_path, submitter, status, transaction_date, withdrawer_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (category, event_id, description, int(amount), basis, receipt_path, submitter, status, transaction_date, withdrawer_name))
                conn.commit()
                self.send_json_response(201, {'id': cursor.lastrowid, 'status': 'success'})
            
            elif path == '/api/budgets':
                event_id = data.get('event_id')
                type_ = data.get('type')
                category = data.get('category')
                description = data.get('description')
                details = data.get('details')
                amount = data.get('amount')

                if not event_id or not type_ or not category or not description or amount is None:
                    self.send_error_response(400, "필수 정보가 누락되었습니다.")
                    return

                cursor.execute("""
                    INSERT INTO budget_planning (event_id, type, category, description, details, amount)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (int(event_id), type_, category, description, details, int(amount)))
                conn.commit()
                self.send_json_response(201, {'id': cursor.lastrowid, 'status': 'success'})

            elif path == '/api/dues/items':
                title = data.get('title')
                type_ = data.get('type', '정기 회비')
                event_id = data.get('event_id')
                if event_id:
                    event_id = int(event_id)
                target_amount = data.get('target_amount', 0)
                due_date = data.get('due_date')
                description = data.get('description', '')

                if not title:
                    self.send_error_response(400, "회비 명칭은 필수입니다.")
                    return

                cursor.execute("""
                    INSERT INTO fee_items (title, type, event_id, target_amount, due_date, description)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (title, type_, event_id, int(target_amount or 0), due_date, description))
                conn.commit()
                self.send_json_response(201, {'id': cursor.lastrowid, 'status': 'success'})

            elif path == '/api/dues/payments':
                fee_item_id = data.get('fee_item_id')
                if not fee_item_id:
                    self.send_error_response(400, "회비 항목 ID는 필수입니다.")
                    return

                cursor.execute("SELECT target_amount FROM fee_items WHERE id = ?", (int(fee_item_id),))
                fee_item = cursor.fetchone()
                target_amount = fee_item[0] if fee_item else 0

                members_to_add = []
                if 'names' in data and data['names']:
                    raw_names = data['names']
                    if isinstance(raw_names, str):
                        raw_list = [n.strip() for n in raw_names.replace(',', '\n').split('\n') if n.strip()]
                    else:
                        raw_list = [str(n).strip() for n in raw_names if str(n).strip()]
                    
                    for n in raw_list:
                        members_to_add.append({
                            'name': n,
                            'student_id': '',
                            'status': '미납',
                            'paid_amount': 0,
                            'paid_date': None,
                            'memo': ''
                        })
                else:
                    member_name = data.get('member_name')
                    if not member_name:
                        self.send_error_response(400, "부원 성명은 필수입니다.")
                        return
                    status = data.get('status', '미납')
                    paid_amount = data.get('paid_amount')
                    if paid_amount is None:
                        paid_amount = target_amount if status == '납부 완료' else 0
                    paid_date = data.get('paid_date')
                    if not paid_date and status == '납부 완료':
                        paid_date = datetime.datetime.now().strftime('%Y-%m-%d')
                    members_to_add.append({
                        'name': member_name,
                        'student_id': data.get('student_id', ''),
                        'status': status,
                        'paid_amount': int(paid_amount or 0),
                        'paid_date': paid_date,
                        'memo': data.get('memo', '')
                    })

                for m in members_to_add:
                    cursor.execute("""
                        INSERT INTO fee_payments (fee_item_id, member_name, student_id, status, paid_amount, paid_date, memo)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (int(fee_item_id), m['name'], m['student_id'], m['status'], m['paid_amount'], m['paid_date'], m['memo']))
                
                conn.commit()
                self.send_json_response(201, {'added_count': len(members_to_add), 'status': 'success'})

            elif path == '/api/dues/copy-members':
                source_item_id = data.get('source_item_id')
                target_item_id = data.get('target_item_id')
                if not source_item_id or not target_item_id:
                    self.send_error_response(400, "원본 및 대상 회비 ID는 필수입니다.")
                    return

                cursor.execute("SELECT member_name FROM fee_payments WHERE fee_item_id = ?", (int(target_item_id),))
                existing_names = set(row[0] for row in cursor.fetchall())

                cursor.execute("SELECT member_name, student_id FROM fee_payments WHERE fee_item_id = ?", (int(source_item_id),))
                source_members = cursor.fetchall()
                
                copied_count = 0
                for row in source_members:
                    name = row[0]
                    student_id = row[1]
                    if name not in existing_names:
                        cursor.execute("""
                            INSERT INTO fee_payments (fee_item_id, member_name, student_id, status, paid_amount, paid_date, memo)
                            VALUES (?, ?, ?, '미납', 0, NULL, '')
                        """, (int(target_item_id), name, student_id))
                        copied_count += 1
                
                conn.commit()
                self.send_json_response(200, {'copied_count': copied_count, 'status': 'success'})

            elif path == '/api/dues/sync-to-income':
                fee_item_id = data.get('fee_item_id')
                if not fee_item_id:
                    self.send_error_response(400, "회비 항목 ID는 필수입니다.")
                    return

                cursor.execute("SELECT * FROM fee_items WHERE id = ?", (int(fee_item_id),))
                fee_item = cursor.fetchone()
                if not fee_item:
                    self.send_error_response(404, "회비 항목을 찾을 수 없습니다.")
                    return
                fee_item = dict(fee_item)

                cursor.execute("""
                    SELECT COUNT(*) as paid_count, COALESCE(SUM(paid_amount), 0) as total_paid
                    FROM fee_payments
                    WHERE fee_item_id = ? AND status = '납부 완료'
                """, (int(fee_item_id),))
                stat = dict(cursor.fetchone())
                total_paid = stat['total_paid']
                paid_count = stat['paid_count']

                if total_paid <= 0:
                    self.send_error_response(400, "납부 완료된 금액이 없어 수입 장부에 반영할 내역이 없습니다.")
                    return

                today_str = datetime.datetime.now().strftime('%Y-%m-%d')
                description = f"[{fee_item['title']}] 납부 회비 정산"
                basis = f"납부 완료 {paid_count}명 기준 (총 {total_paid:,}원)"
                payer_name = f"동아리 부원 ({paid_count}명)"

                cursor.execute("""
                    INSERT INTO income_management (category, event_id, description, amount, basis, remarks, transaction_date, payer_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, ('회비', fee_item['event_id'], description, total_paid, basis, f"{fee_item['title']} 납부 관리 자동 연동", today_str, payer_name))
                conn.commit()
                self.send_json_response(201, {'status': 'success', 'income_id': cursor.lastrowid, 'amount': total_paid})
            
            else:
                self.send_error_response(404, "API endpoint not found")
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    # --- PUT API Handlers ---
    def handle_api_put(self, path, data):
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            if path == '/api/events':
                id_ = data.get('id')
                name = data.get('name')
                month = data.get('month')
                if not id_ or not name:
                    self.send_error_response(400, "ID와 행사명은 필수입니다.")
                    return
                cursor.execute("UPDATE event_master SET name = ?, month = ? WHERE id = ?", (name, month, id_))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/events/settle':
                id_ = data.get('id')
                is_settled = data.get('is_settled', 0)
                settled_date = data.get('settled_date')
                settlement_notes = data.get('settlement_notes')

                if not id_:
                    self.send_error_response(400, "행사 ID는 필수입니다.")
                    return

                cursor.execute("""
                    UPDATE event_master 
                    SET is_settled = ?, settled_date = ?, settlement_notes = ?
                    WHERE id = ?
                """, (int(is_settled), settled_date, settlement_notes, int(id_)))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/income':
                id_ = data.get('id')
                category = data.get('category')
                event_id = data.get('event_id')
                description = data.get('description')
                amount = data.get('amount')
                basis = data.get('basis')
                remarks = data.get('remarks')
                transaction_date = data.get('transaction_date')
                payer_name = data.get('payer_name')

                if not id_ or not category or not description or amount is None:
                    self.send_error_response(400, "필수 항목이 누락되었습니다.")
                    return

                cursor.execute("""
                    UPDATE income_management 
                    SET category = ?, event_id = ?, description = ?, amount = ?, basis = ?, remarks = ?, transaction_date = ?, payer_name = ?
                    WHERE id = ?
                """, (category, event_id, description, int(amount), basis, remarks, transaction_date, payer_name, id_))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/expenditures':
                id_ = data.get('id')
                category = data.get('category')
                event_id = data.get('event_id')
                description = data.get('description')
                amount = data.get('amount')
                basis = data.get('basis')
                receipt_path = data.get('receipt_path')
                submitter = data.get('submitter')
                status = data.get('status')
                transaction_date = data.get('transaction_date')
                withdrawer_name = data.get('withdrawer_name') or submitter

                if not id_ or not category or not description or amount is None or not submitter or not status:
                    self.send_error_response(400, "필수 항목이 누락되었습니다.")
                    return

                cursor.execute("""
                    UPDATE expenditure_receipt 
                    SET category = ?, event_id = ?, description = ?, amount = ?, basis = ?, receipt_path = ?, submitter = ?, status = ?, transaction_date = ?, withdrawer_name = ?
                    WHERE id = ?
                """, (category, event_id, description, int(amount), basis, receipt_path, submitter, status, transaction_date, withdrawer_name, id_))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/expenditures/status':
                id_ = data.get('id')
                status = data.get('status')
                if not id_ or not status:
                    self.send_error_response(400, "ID와 승인 상태는 필수입니다.")
                    return
                cursor.execute("UPDATE expenditure_receipt SET status = ? WHERE id = ?", (status, id_))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/budgets':
                id_ = data.get('id')
                event_id = data.get('event_id')
                type_ = data.get('type')
                category = data.get('category')
                description = data.get('description')
                details = data.get('details')
                amount = data.get('amount')

                if not id_ or not event_id or not type_ or not category or not description or amount is None:
                    self.send_error_response(400, "필수 항목이 누락되었습니다.")
                    return

                cursor.execute("""
                    UPDATE budget_planning 
                    SET event_id = ?, type = ?, category = ?, description = ?, details = ?, amount = ?
                    WHERE id = ?
                """, (int(event_id), type_, category, description, details, int(amount), int(id_)))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/dues/items':
                id_ = data.get('id')
                title = data.get('title')
                type_ = data.get('type')
                event_id = data.get('event_id')
                if event_id:
                    event_id = int(event_id)
                target_amount = data.get('target_amount')
                due_date = data.get('due_date')
                description = data.get('description')

                if not id_ or not title:
                    self.send_error_response(400, "ID와 회비명은 필수입니다.")
                    return

                cursor.execute("""
                    UPDATE fee_items
                    SET title = ?, type = ?, event_id = ?, target_amount = ?, due_date = ?, description = ?
                    WHERE id = ?
                """, (title, type_, event_id, int(target_amount or 0), due_date, description, int(id_)))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/dues/payments':
                id_ = data.get('id')
                member_name = data.get('member_name')
                student_id = data.get('student_id', '')
                status = data.get('status')
                paid_amount = data.get('paid_amount', 0)
                paid_date = data.get('paid_date')
                memo = data.get('memo', '')

                if not id_ or not member_name:
                    self.send_error_response(400, "ID와 부원 성명은 필수입니다.")
                    return

                cursor.execute("""
                    UPDATE fee_payments
                    SET member_name = ?, student_id = ?, status = ?, paid_amount = ?, paid_date = ?, memo = ?
                    WHERE id = ?
                """, (member_name, student_id, status, int(paid_amount or 0), paid_date, memo, int(id_)))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/dues/payments/toggle':
                id_ = data.get('id')
                if not id_:
                    self.send_error_response(400, "ID는 필수입니다.")
                    return

                cursor.execute("""
                    SELECT fp.*, fi.target_amount
                    FROM fee_payments fp
                    JOIN fee_items fi ON fp.fee_item_id = fi.id
                    WHERE fp.id = ?
                """, (int(id_),))
                row = cursor.fetchone()
                if not row:
                    self.send_error_response(404, "납부 기록을 찾을 수 없습니다.")
                    return
                payment = dict(row)

                if payment['status'] == '납부 완료':
                    new_status = '미납'
                    new_amount = 0
                    new_date = None
                else:
                    new_status = '납부 완료'
                    new_amount = payment['target_amount'] or payment['paid_amount'] or 0
                    new_date = datetime.datetime.now().strftime('%Y-%m-%d')

                cursor.execute("""
                    UPDATE fee_payments
                    SET status = ?, paid_amount = ?, paid_date = ?
                    WHERE id = ?
                """, (new_status, new_amount, new_date, int(id_)))
                conn.commit()
                self.send_json_response(200, {
                    'status': 'success',
                    'new_status': new_status,
                    'paid_amount': new_amount,
                    'paid_date': new_date
                })
            
            else:
                self.send_error_response(404, "API endpoint not found")
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    # --- DELETE API Handlers ---
    def handle_api_delete(self, path, query):
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            id_list = query.get('id')
            if not id_list:
                self.send_error_response(400, "ID parameter is required")
                return
            id_ = int(id_list[0])

            if path == '/api/events':
                cursor.execute("DELETE FROM event_master WHERE id = ?", (id_,))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/income':
                cursor.execute("DELETE FROM income_management WHERE id = ?", (id_,))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/budgets':
                cursor.execute("DELETE FROM budget_planning WHERE id = ?", (id_,))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/dues/items':
                cursor.execute("DELETE FROM fee_items WHERE id = ?", (id_,))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/dues/payments':
                cursor.execute("DELETE FROM fee_payments WHERE id = ?", (id_,))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})

            elif path == '/api/expenditures':
                # Delete physical receipt if exists
                cursor.execute("SELECT receipt_path FROM expenditure_receipt WHERE id = ?", (id_,))
                row = cursor.fetchone()
                if row and row['receipt_path']:
                    path_to_delete = os.path.join(UPLOAD_DIR, os.path.basename(row['receipt_path']))
                    if os.path.exists(path_to_delete):
                        try:
                            os.remove(path_to_delete)
                        except Exception as delete_err:
                            print(f"Error deleting file {path_to_delete}: {delete_err}")
                
                cursor.execute("DELETE FROM expenditure_receipt WHERE id = ?", (id_,))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})
            else:
                self.send_error_response(404, "API endpoint not found")
        except Exception as e:
            self.send_error_response(500, str(e))
        finally:
            conn.close()

    # --- Receipt Upload Handler ---
    def handle_receipt_upload(self):
        try:
            content_type_header = self.headers.get('content-type', '')

            # Parse content-type and boundary manually (replaces cgi.parse_header)
            ct_parts = content_type_header.split(';')
            ctype = ct_parts[0].strip()

            if ctype != 'multipart/form-data':
                self.send_error_response(400, "Content-Type must be multipart/form-data")
                return

            boundary = None
            for part in ct_parts[1:]:
                part = part.strip()
                if part.lower().startswith('boundary='):
                    boundary = part[9:].strip('"')
                    break

            if not boundary:
                self.send_error_response(400, "Missing boundary in Content-Type")
                return

            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            # Use email module to parse multipart (replaces cgi.parse_multipart)
            msg_bytes = ('Content-Type: ' + content_type_header + '\r\n\r\n').encode('utf-8') + body
            msg = email.message_from_bytes(msg_bytes)

            fields = {}
            for part in msg.walk():
                if part.get_content_maintype() == 'multipart':
                    continue
                name = part.get_param('name', header='content-disposition')
                if name:
                    if name not in fields:
                        fields[name] = []
                    fields[name].append(part.get_payload(decode=True))

            if 'receipt' not in fields:
                self.send_error_response(400, "No receipt file found in upload")
                return

            file_data = fields['receipt'][0]  # bytes

            # Generate UUID filename
            file_ext = '.jpg'
            filename = f"{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(UPLOAD_DIR, filename)

            with open(file_path, 'wb') as f:
                f.write(file_data)

            relative_url = f"/uploads/{filename}"
            self.send_json_response(200, {'receipt_path': relative_url})

        except Exception as e:
            self.send_error_response(500, f"Upload failed: {str(e)}")

    # --- Utility response helpers ---
    def send_json_response(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_response(self, status, message):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        body = json.dumps({'error': message}, ensure_ascii=False).encode('utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    # Initialize DB before running
    init_db()
    
    server_address = ('', PORT)
    httpd = socketserver.TCPServer(server_address, YMCApiHandler)
    print(f"YMC Accounting System Backend running at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
        sys.exit(0)
