import http.server
import socketserver
import json
import urllib.parse
import os
import uuid
import shutil
import cgi
import sys
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

                if not category or not description or amount is None:
                    self.send_error_response(400, "분류, 내역, 금액은 필수입니다.")
                    return
                
                cursor.execute("""
                    INSERT INTO income_management (category, event_id, description, amount, basis, remarks)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (category, event_id, description, int(amount), basis, remarks))
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

                if not category or not description or amount is None or not submitter:
                    self.send_error_response(400, "분류, 내역, 금액, 제출자는 필수입니다.")
                    return

                cursor.execute("""
                    INSERT INTO expenditure_receipt (category, event_id, description, amount, basis, receipt_path, submitter, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (category, event_id, description, int(amount), basis, receipt_path, submitter, status))
                conn.commit()
                self.send_json_response(201, {'id': cursor.lastrowid, 'status': 'success'})
            
            elif path == '/api/budgets':
                event_id = data.get('event_id')
                type_ = data.get('type')
                category = data.get('category')
                description = data.get('description')
                amount = data.get('amount')

                if not event_id or not type_ or not category or not description or amount is None:
                    self.send_error_response(400, "필수 정보가 누락되었습니다.")
                    return

                cursor.execute("""
                    INSERT INTO budget_planning (event_id, type, category, description, amount)
                    VALUES (?, ?, ?, ?, ?)
                """, (int(event_id), type_, category, description, int(amount)))
                conn.commit()
                self.send_json_response(201, {'id': cursor.lastrowid, 'status': 'success'})
            
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

                if not id_ or not category or not description or amount is None:
                    self.send_error_response(400, "필수 항목이 누락되었습니다.")
                    return

                cursor.execute("""
                    UPDATE income_management 
                    SET category = ?, event_id = ?, description = ?, amount = ?, basis = ?, remarks = ?
                    WHERE id = ?
                """, (category, event_id, description, int(amount), basis, remarks, id_))
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

                if not id_ or not category or not description or amount is None or not submitter or not status:
                    self.send_error_response(400, "필수 항목이 누락되었습니다.")
                    return

                cursor.execute("""
                    UPDATE expenditure_receipt 
                    SET category = ?, event_id = ?, description = ?, amount = ?, basis = ?, receipt_path = ?, submitter = ?, status = ?
                    WHERE id = ?
                """, (category, event_id, description, int(amount), basis, receipt_path, submitter, status, id_))
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
                amount = data.get('amount')

                if not id_ or not event_id or not type_ or not category or not description or amount is None:
                    self.send_error_response(400, "필수 항목이 누락되었습니다.")
                    return

                cursor.execute("""
                    UPDATE budget_planning 
                    SET event_id = ?, type = ?, category = ?, description = ?, amount = ?
                    WHERE id = ?
                """, (int(event_id), type_, category, description, int(amount), int(id_)))
                conn.commit()
                self.send_json_response(200, {'status': 'success'})
            
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
            # Parse multipart form data
            ctype, pdict = cgi.parse_header(self.headers.get('content-type'))
            if ctype != 'multipart/form-data':
                self.send_error_response(400, "Content-Type must be multipart/form-data")
                return

            # parse_multipart requires boundary to be bytes in python3
            pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
            
            # Read all request data
            # Use content-length to prevent hang
            content_length = int(self.headers.get('Content-Length', 0))
            # Limit read to content_length
            fields = cgi.parse_multipart(self.rfile, pdict)
            
            if 'receipt' not in fields:
                self.send_error_response(400, "No receipt file found in upload")
                return
            
            file_data = fields['receipt'][0] # returns bytes
            
            # Get original filename if provided (can extract from headers or generate)
            # Safe unique filename generation
            file_ext = '.jpg'
            # Look at header if possible, else default to .jpg
            # Generate UUID filename
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
