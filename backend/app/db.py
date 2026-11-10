import sqlite3
import os
from typing import List, Dict, Any, Optional
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "appointments.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes SQLite database and tables."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS appointments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NOT NULL,
            purpose TEXT NOT NULL,
            appointment_time TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'confirmed'
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sent_invitations (
            id TEXT PRIMARY KEY,
            ref_id TEXT NOT NULL,
            name TEXT NOT NULL,
            recipient TEXT NOT NULL,
            phone TEXT,
            appointment_time TEXT,
            subject TEXT NOT NULL,
            status TEXT NOT NULL,
            mode TEXT NOT NULL,
            sent_at TEXT NOT NULL,
            google_calendar_url TEXT,
            preview_html TEXT,
            ics_content TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS google_oauth_tokens (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_type TEXT DEFAULT 'Bearer',
            expires_at REAL,
            scope TEXT,
            user_email TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def create_appointment(
    ref_id: str,
    name: str,
    phone: str,
    email: str,
    purpose: str,
    appointment_time: str
) -> Dict[str, Any]:
    """Saves a new customer appointment record into the database."""
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.utcnow().isoformat()
    
    cursor.execute("""
        INSERT OR REPLACE INTO appointments (id, name, phone, email, purpose, appointment_time, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    """, (ref_id, name, phone, email, purpose, appointment_time, created_at))
    conn.commit()
    conn.close()

    return {
        "id": ref_id,
        "name": name,
        "phone": phone,
        "email": email,
        "purpose": purpose,
        "appointment_time": appointment_time,
        "created_at": created_at,
        "status": "confirmed"
    }


def get_all_appointments() -> List[Dict[str, Any]]:
    """Retrieves all booked customer appointments."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM appointments ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_status(ref_id: str, status: str) -> bool:
    """Updates appointment status (e.g. confirmed, completed, cancelled)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE appointments SET status = ? WHERE id = ?", (status, ref_id))
    affected = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return affected


def delete_appointment(ref_id: str) -> bool:
    """Deletes an appointment by reference ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM appointments WHERE id = ?", (ref_id,))
    affected = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return affected


def save_sent_invitation(record: Dict[str, Any]) -> None:
    """Persists a sent calendar event invitation record."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO sent_invitations (
            id, ref_id, name, recipient, phone, appointment_time, subject, status, mode, sent_at, google_calendar_url, preview_html, ics_content
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        record.get("id", f"INV-{int(datetime.utcnow().timestamp())}"),
        record.get("ref_id", ""),
        record.get("name", ""),
        record.get("recipient", ""),
        record.get("phone", ""),
        record.get("appointment_time", ""),
        record.get("subject", ""),
        record.get("status", "sent"),
        record.get("mode", "simulated"),
        record.get("sent_at", datetime.utcnow().isoformat()),
        record.get("google_calendar_url", ""),
        record.get("preview_html", ""),
        record.get("ics_content", "")
    ))
    conn.commit()
    conn.close()


def get_all_sent_invitations() -> List[Dict[str, Any]]:
    """Retrieves all sent calendar event invitations."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sent_invitations ORDER BY sent_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def save_google_tokens(tokens: Dict[str, Any], user_email: Optional[str] = None) -> None:
    """Saves or updates Google OAuth2 access & refresh tokens."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT refresh_token, user_email FROM google_oauth_tokens WHERE id = 1")
    row = cursor.fetchone()
    existing_refresh = row["refresh_token"] if row else None
    existing_email = row["user_email"] if row else None

    refresh_token = tokens.get("refresh_token") or existing_refresh
    email = user_email or tokens.get("user_email") or existing_email or ""
    access_token = tokens.get("access_token", "")
    token_type = tokens.get("token_type", "Bearer")
    expires_at = tokens.get("expires_at", 0)
    scope = tokens.get("scope", "")
    now_str = datetime.utcnow().isoformat()

    cursor.execute("""
        INSERT INTO google_oauth_tokens (id, access_token, refresh_token, token_type, expires_at, scope, user_email, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = COALESCE(excluded.refresh_token, google_oauth_tokens.refresh_token),
            token_type = excluded.token_type,
            expires_at = excluded.expires_at,
            scope = excluded.scope,
            user_email = COALESCE(excluded.user_email, google_oauth_tokens.user_email),
            updated_at = excluded.updated_at
    """, (access_token, refresh_token, token_type, expires_at, scope, email, now_str, now_str))
    conn.commit()
    conn.close()


def get_google_tokens() -> Optional[Dict[str, Any]]:
    """Retrieves stored Google OAuth2 tokens."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM google_oauth_tokens WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def clear_google_tokens() -> None:
    """Clears stored Google OAuth2 tokens upon disconnection."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM google_oauth_tokens WHERE id = 1")
    conn.commit()
    conn.close()


# Auto-initialize on module load
init_db()

