import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ymc_accounting.db')
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    import psycopg2
    import psycopg2.extras

    class PostgreSQLCursorWrapper:
        def __init__(self, cursor):
            self.cursor = cursor
            self._lastrowid = None

        def execute(self, query, params=None):
            # Translate SQLite syntax to PostgreSQL
            translated_query = query.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
            translated_query = translated_query.replace('?', '%s')
            
            is_insert = translated_query.strip().upper().startswith("INSERT")
            if is_insert and "RETURNING" not in translated_query.upper():
                translated_query += " RETURNING id"

            if params is not None:
                if not isinstance(params, (tuple, list, dict)):
                    params = (params,)
                self.cursor.execute(translated_query, params)
            else:
                self.cursor.execute(translated_query)

            if is_insert:
                try:
                    row = self.cursor.fetchone()
                    if row:
                        self._lastrowid = row[0]
                except Exception:
                    self._lastrowid = None

            return self

        def executemany(self, query, params_list):
            translated_query = query.replace('?', '%s')
            self.cursor.executemany(translated_query, params_list)
            return self

        def fetchone(self):
            return self.cursor.fetchone()

        def fetchall(self):
            return self.cursor.fetchall()

        def close(self):
            self.cursor.close()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            self.close()

        @property
        def description(self):
            return self.cursor.description

        @property
        def lastrowid(self):
            return self._lastrowid

    class PostgreSQLConnectionWrapper:
        def __init__(self, conn):
            self.conn = conn

        def cursor(self):
            cursor = self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            return PostgreSQLCursorWrapper(cursor)

        def commit(self):
            self.conn.commit()

        def rollback(self):
            self.conn.rollback()

        def close(self):
            self.conn.close()

        def execute(self, query, params=None):
            if "PRAGMA" in query.upper():
                return
            with self.cursor() as cur:
                cur.execute(query, params)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            self.close()

    def get_db_connection():
        # Handle Render style connection URL natively
        conn = psycopg2.connect(DATABASE_URL)
        return PostgreSQLConnectionWrapper(conn)

else:
    def get_db_connection():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        # Enable foreign keys support
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Event Master Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS event_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        month TEXT,
        is_settled INTEGER DEFAULT 0,
        settled_date TEXT,
        settlement_notes TEXT
    )
    ''')
    
    # 2. Income Management Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS income_management (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        event_id INTEGER,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL,
        basis TEXT,
        remarks TEXT,
        transaction_date TEXT,
        payer_name TEXT,
        fee_payment_id INTEGER,
        FOREIGN KEY (event_id) REFERENCES event_master(id) ON DELETE SET NULL
    )
    ''')
    
    # 3. Expenditure & Receipt Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS expenditure_receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        event_id INTEGER,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL,
        basis TEXT,
        receipt_path TEXT,
        submitter TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '승인 대기',
        transaction_date TEXT,
        withdrawer_name TEXT,
        FOREIGN KEY (event_id) REFERENCES event_master(id) ON DELETE SET NULL
    )
    ''')

    # 4. Budget Planning Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS budget_planning (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        type TEXT NOT NULL, -- '수입', '지출'
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        details TEXT,
        amount INTEGER NOT NULL,
        FOREIGN KEY (event_id) REFERENCES event_master(id) ON DELETE CASCADE
    )
    ''')

    # 5. Fee Items Table (연간 2회 정기회비 + 행사별 회비 동적 관리)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS fee_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL, -- '정기 회비', '행사 회비'
        event_id INTEGER,
        target_amount INTEGER NOT NULL DEFAULT 0,
        due_date TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES event_master(id) ON DELETE SET NULL
    )
    ''')

    # 6. Fee Payments Table (부원별 회비 납부 현황)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS fee_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fee_item_id INTEGER NOT NULL,
        member_name TEXT NOT NULL,
        student_id TEXT,
        status TEXT NOT NULL DEFAULT '미납', -- '미납', '납부 완료', '면제'
        paid_amount INTEGER NOT NULL DEFAULT 0,
        paid_date TEXT,
        memo TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fee_item_id) REFERENCES fee_items(id) ON DELETE CASCADE
    )
    ''')
    
    # Handle DB migrations without deleting existing accounting data
    if DATABASE_URL:
        cursor.execute("ALTER TABLE income_management ADD COLUMN IF NOT EXISTS transaction_date TEXT")
        cursor.execute("ALTER TABLE income_management ADD COLUMN IF NOT EXISTS payer_name TEXT")
        cursor.execute("ALTER TABLE income_management ADD COLUMN IF NOT EXISTS fee_payment_id INTEGER")
        cursor.execute("ALTER TABLE expenditure_receipt ADD COLUMN IF NOT EXISTS transaction_date TEXT")
        cursor.execute("ALTER TABLE expenditure_receipt ADD COLUMN IF NOT EXISTS withdrawer_name TEXT")
        cursor.execute("ALTER TABLE event_master ADD COLUMN IF NOT EXISTS is_settled INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE event_master ADD COLUMN IF NOT EXISTS settled_date TEXT")
        cursor.execute("ALTER TABLE event_master ADD COLUMN IF NOT EXISTS settlement_notes TEXT")
        cursor.execute("ALTER TABLE budget_planning ADD COLUMN IF NOT EXISTS details TEXT")
    else:
        migrations = {
            'event_master': [('is_settled', 'INTEGER DEFAULT 0'), ('settled_date', 'TEXT'), ('settlement_notes', 'TEXT')],
            'income_management': [('transaction_date', 'TEXT'), ('payer_name', 'TEXT'), ('fee_payment_id', 'INTEGER')],
            'expenditure_receipt': [('transaction_date', 'TEXT'), ('withdrawer_name', 'TEXT')],
            'budget_planning': [('details', 'TEXT')]
        }
        for table_name, columns in migrations.items():
            for col_name, col_type in columns:
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}")
                except sqlite3.OperationalError:
                    pass

    # Each dues payment maps to at most one automatically synchronized income row.
    # NULL is allowed so manually entered income records are unaffected.
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_income_fee_payment_id
        ON income_management (fee_payment_id)
    """)

    # Insert default rows for Event Master if empty
    cursor.execute("SELECT COUNT(*) FROM event_master")
    if cursor.fetchone()[0] == 0:
        default_events = [
            ('예배자 학교', '3월'),
            ('동아리 MT / 아웃팅', '5월'),
            ('선교축제 부스', '9월'),
            ('주차별 정기모임', '3월'),
            ('공통 운영', '1월')
        ]
        cursor.executemany("INSERT INTO event_master (name, month) VALUES (?, ?)", default_events)

    # Insert default Fee Items (연간 2회 정기회비 + 샘플 행사 회비)
    cursor.execute("SELECT COUNT(*) FROM fee_items")
    if cursor.fetchone()[0] == 0:
        # Check event_master for MT event id
        cursor.execute("SELECT id FROM event_master WHERE name LIKE '%MT%' LIMIT 1")
        mt_event = cursor.fetchone()
        mt_event_id = mt_event[0] if mt_event else None

        default_fee_items = [
            ('2026 1학기 정기회비', '정기 회비', None, 20000, '2026-03-31', '1학기 동아리 기본 활동 및 운영 회비'),
            ('2026 2학기 정기회비', '정기 회비', None, 20000, '2026-09-30', '2학기 동아리 기본 활동 및 운영 회비')
        ]
        if mt_event_id:
            default_fee_items.append(('동아리 봄 MT 참가비', '행사 회비', mt_event_id, 35000, '2026-05-15', 'MT 숙소 및 식비 부원 참가비'))

        for title, ftype, eid, amount, due, desc in default_fee_items:
            cursor.execute("""
                INSERT INTO fee_items (title, type, event_id, target_amount, due_date, description)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (title, ftype, eid, amount, due, desc))
            item_id = cursor.lastrowid
            
            # If 1st semester fee, add a few sample members to demonstrate
            if '1학기' in title:
                sample_members = [
                    (item_id, '김철수', '22학번', '납부 완료', 20000, '2026-03-05', '국민은행 입금 확인'),
                    (item_id, '이영희', '23학번', '납부 완료', 20000, '2026-03-06', '카카오페이'),
                    (item_id, '박민수', '24학번', '미납', 0, None, '납부 안내 문자 발송'),
                    (item_id, '정다은', '21학번', '미납', 0, None, '')
                ]
                cursor.executemany("""
                    INSERT INTO fee_payments (fee_item_id, member_name, student_id, status, paid_amount, paid_date, memo)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, sample_members)
        
    conn.commit()
    conn.close()

def clear_transaction_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Delete all income, expenditure, budget planning data
        cursor.execute("DELETE FROM income_management")
        cursor.execute("DELETE FROM expenditure_receipt")
        cursor.execute("DELETE FROM budget_planning")
        
        # Reset event settlement status, but KEEP the events
        cursor.execute("UPDATE event_master SET is_settled = 0, settled_date = NULL, settlement_notes = NULL")
        
        # Also, delete any files in uploads directory
        upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
        if os.path.exists(upload_dir):
            for f in os.listdir(upload_dir):
                f_path = os.path.join(upload_dir, f)
                if os.path.isfile(f_path):
                    try:
                        os.remove(f_path)
                    except Exception as err:
                        print(f"Error deleting file {f_path}: {err}")
                        
        conn.commit()
        print("All transaction and budget data cleared successfully.")
    except Exception as e:
        conn.rollback()
        print(f"Error clearing data: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at:", DB_PATH)
