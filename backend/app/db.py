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


# Auto-initialize on module load
init_db()

