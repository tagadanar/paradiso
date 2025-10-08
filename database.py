import sqlite3
from contextlib import contextmanager
from typing import List, Dict, Any, Optional

DATABASE_PATH = "films.db"


@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    # Enable foreign key constraints (required for CASCADE DELETE)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS films (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                imdb_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                year TEXT NOT NULL,
                poster_url TEXT,
                genre TEXT,
                director TEXT,
                actors TEXT,
                plot TEXT,
                trailer_url TEXT,
                is_archived INTEGER DEFAULT 0,
                archive_date TEXT,
                archive_commentary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                film_id INTEGER NOT NULL,
                profile_id INTEGER NOT NULL,
                vote INTEGER NOT NULL,
                voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(film_id, profile_id),
                FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE,
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_votes_film_id ON votes(film_id);
            CREATE INDEX IF NOT EXISTS idx_votes_profile_id ON votes(profile_id);

            CREATE TABLE IF NOT EXISTS viewed (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                film_id INTEGER NOT NULL,
                profile_id INTEGER NOT NULL,
                viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(film_id, profile_id),
                FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE,
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_viewed_film_id ON viewed(film_id);
            CREATE INDEX IF NOT EXISTS idx_viewed_profile_id ON viewed(profile_id);
        """)
        conn.commit()

        # Clean up orphaned votes and viewed records (from before foreign keys were enabled)
        conn.execute("""
            DELETE FROM votes
            WHERE profile_id NOT IN (SELECT id FROM profiles)
            OR film_id NOT IN (SELECT id FROM films)
        """)
        conn.execute("""
            DELETE FROM viewed
            WHERE profile_id NOT IN (SELECT id FROM profiles)
            OR film_id NOT IN (SELECT id FROM films)
        """)
        conn.commit()

        # Migration: Add archive columns if they don't exist
        cursor = conn.execute("PRAGMA table_info(films)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'is_archived' not in columns:
            conn.execute("ALTER TABLE films ADD COLUMN is_archived INTEGER DEFAULT 0")
        if 'archive_date' not in columns:
            conn.execute("ALTER TABLE films ADD COLUMN archive_date TEXT")
        if 'archive_commentary' not in columns:
            conn.execute("ALTER TABLE films ADD COLUMN archive_commentary TEXT")
        conn.commit()


def dict_from_row(row) -> Dict[str, Any]:
    return dict(zip(row.keys(), row))


# Profile operations
def create_profile(name: str) -> Dict[str, Any]:
    with get_db() as conn:
        cursor = conn.execute("INSERT INTO profiles (name) VALUES (?)", (name,))
        conn.commit()
        profile = conn.execute("SELECT * FROM profiles WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict_from_row(profile)


def get_profiles() -> List[Dict[str, Any]]:
    with get_db() as conn:
        profiles = conn.execute("SELECT * FROM profiles ORDER BY created_at DESC").fetchall()
        return [dict_from_row(p) for p in profiles]


def get_profile_by_name(name: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        profile = conn.execute("SELECT * FROM profiles WHERE name = ?", (name,)).fetchone()
        return dict_from_row(profile) if profile else None


# Film operations
def create_film(imdb_id: str, title: str, year: str, poster_url: Optional[str],
                genre: str, director: str, actors: str, plot: str, trailer_url: str) -> Dict[str, Any]:
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO films (imdb_id, title, year, poster_url, genre, director, actors, plot, trailer_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (imdb_id, title, year, poster_url, genre, director, actors, plot, trailer_url)
        )
        conn.commit()
        film = conn.execute("SELECT * FROM films WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict_from_row(film)


def get_films_with_votes() -> List[Dict[str, Any]]:
    with get_db() as conn:
        films = conn.execute("""
            SELECT
                f.*,
                COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
                COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes,
                COALESCE(SUM(CASE WHEN v.vote = 2 THEN 1 ELSE 0 END), 0) as neutral_votes,
                COALESCE(SUM(CASE WHEN v.vote IN (1, -1) THEN v.vote ELSE 0 END), 0) as total_score
            FROM films f
            LEFT JOIN votes v ON f.id = v.film_id
            WHERE f.is_archived = 0
            GROUP BY f.id
            ORDER BY total_score DESC, f.created_at DESC
        """).fetchall()
        return [dict_from_row(f) for f in films]


def get_films_with_votes_filtered(profile_ids: List[int]) -> List[Dict[str, Any]]:
    """Get films with votes filtered by specific profile IDs"""
    with get_db() as conn:
        # Build placeholders for the IN clause
        placeholders = ','.join('?' * len(profile_ids))

        films = conn.execute(f"""
            SELECT
                f.*,
                COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
                COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes,
                COALESCE(SUM(CASE WHEN v.vote = 2 THEN 1 ELSE 0 END), 0) as neutral_votes,
                COALESCE(SUM(CASE WHEN v.vote IN (1, -1) THEN v.vote ELSE 0 END), 0) as total_score
            FROM films f
            LEFT JOIN votes v ON f.id = v.film_id AND v.profile_id IN ({placeholders})
            WHERE f.is_archived = 0
            GROUP BY f.id
            ORDER BY total_score DESC, f.created_at DESC
        """, profile_ids).fetchall()
        return [dict_from_row(f) for f in films]


def get_archived_films_with_votes() -> List[Dict[str, Any]]:
    """Get archived films with votes"""
    with get_db() as conn:
        films = conn.execute("""
            SELECT
                f.*,
                COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
                COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes,
                COALESCE(SUM(CASE WHEN v.vote = 2 THEN 1 ELSE 0 END), 0) as neutral_votes,
                COALESCE(SUM(CASE WHEN v.vote IN (1, -1) THEN v.vote ELSE 0 END), 0) as total_score
            FROM films f
            LEFT JOIN votes v ON f.id = v.film_id
            WHERE f.is_archived = 1
            GROUP BY f.id
            ORDER BY f.created_at DESC
        """).fetchall()
        return [dict_from_row(f) for f in films]


def get_archived_films_with_votes_filtered(profile_ids: List[int]) -> List[Dict[str, Any]]:
    """Get archived films with votes filtered by specific profile IDs"""
    with get_db() as conn:
        # Build placeholders for the IN clause
        placeholders = ','.join('?' * len(profile_ids))

        films = conn.execute(f"""
            SELECT
                f.*,
                COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
                COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) as downvotes,
                COALESCE(SUM(CASE WHEN v.vote = 2 THEN 1 ELSE 0 END), 0) as neutral_votes,
                COALESCE(SUM(CASE WHEN v.vote IN (1, -1) THEN v.vote ELSE 0 END), 0) as total_score
            FROM films f
            LEFT JOIN votes v ON f.id = v.film_id AND v.profile_id IN ({placeholders})
            WHERE f.is_archived = 1
            GROUP BY f.id
            ORDER BY f.created_at DESC
        """, profile_ids).fetchall()
        return [dict_from_row(f) for f in films]


def get_film_by_imdb_id(imdb_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        film = conn.execute("SELECT * FROM films WHERE imdb_id = ?", (imdb_id,)).fetchone()
        return dict_from_row(film) if film else None


# Vote operations
def create_or_update_vote(film_id: int, profile_id: int, vote: int) -> str:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM votes WHERE film_id = ? AND profile_id = ?",
            (film_id, profile_id)
        ).fetchone()

        if vote == 0:
            if existing:
                conn.execute("DELETE FROM votes WHERE film_id = ? AND profile_id = ?", (film_id, profile_id))
                conn.commit()
                return "removed"
            return "no_vote"

        if existing:
            conn.execute(
                "UPDATE votes SET vote = ?, voted_at = CURRENT_TIMESTAMP WHERE film_id = ? AND profile_id = ?",
                (vote, film_id, profile_id)
            )
            conn.commit()
            return "updated"
        else:
            conn.execute(
                "INSERT INTO votes (film_id, profile_id, vote) VALUES (?, ?, ?)",
                (film_id, profile_id, vote)
            )
            conn.commit()
            return "created"


def get_user_votes(profile_id: int) -> Dict[int, int]:
    with get_db() as conn:
        votes = conn.execute(
            "SELECT film_id, vote FROM votes WHERE profile_id = ?",
            (profile_id,)
        ).fetchall()
        return {v["film_id"]: v["vote"] for v in votes}


def get_profile_by_id(profile_id: int) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        profile = conn.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        return dict_from_row(profile) if profile else None


def get_film_by_id(film_id: int) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        film = conn.execute("SELECT * FROM films WHERE id = ?", (film_id,)).fetchone()
        return dict_from_row(film) if film else None


def get_film_voters(film_id: int) -> Dict[str, List[str]]:
    """Get voters for a specific film, separated by upvotes, downvotes, and neutral"""
    with get_db() as conn:
        voters = conn.execute("""
            SELECT p.name, v.vote
            FROM votes v
            JOIN profiles p ON v.profile_id = p.id
            WHERE v.film_id = ?
        """, (film_id,)).fetchall()

        upvoters = [v['name'] for v in voters if v['vote'] == 1]
        downvoters = [v['name'] for v in voters if v['vote'] == -1]
        neutralvoters = [v['name'] for v in voters if v['vote'] == 2]

        return {
            'upvoters': upvoters,
            'downvoters': downvoters,
            'neutralvoters': neutralvoters
        }


def delete_profile(profile_id: int) -> bool:
    """Delete a profile and all associated votes"""
    with get_db() as conn:
        # Check if profile exists
        profile = conn.execute("SELECT id FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        if not profile:
            return False

        # Delete profile (votes will be cascade deleted due to foreign key)
        conn.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
        conn.commit()
        return True


def delete_film(film_id: int) -> bool:
    """Delete a film and all associated votes"""
    with get_db() as conn:
        # Check if film exists
        film = conn.execute("SELECT id FROM films WHERE id = ?", (film_id,)).fetchone()
        if not film:
            return False

        # Delete film (votes and viewed will be cascade deleted due to foreign key)
        conn.execute("DELETE FROM films WHERE id = ?", (film_id,))
        conn.commit()
        return True


# Viewed operations
def toggle_viewed(film_id: int, profile_id: int) -> bool:
    """Toggle viewed status for a film by a profile. Returns True if now viewed, False if unviewed."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM viewed WHERE film_id = ? AND profile_id = ?",
            (film_id, profile_id)
        ).fetchone()

        if existing:
            # Remove viewed status
            conn.execute("DELETE FROM viewed WHERE film_id = ? AND profile_id = ?", (film_id, profile_id))
            conn.commit()
            return False
        else:
            # Add viewed status
            conn.execute(
                "INSERT INTO viewed (film_id, profile_id) VALUES (?, ?)",
                (film_id, profile_id)
            )
            conn.commit()
            return True


def get_user_viewed(profile_id: int) -> List[int]:
    """Get list of film IDs viewed by a profile"""
    with get_db() as conn:
        viewed = conn.execute(
            "SELECT film_id FROM viewed WHERE profile_id = ?",
            (profile_id,)
        ).fetchall()
        return [v["film_id"] for v in viewed]


def get_film_viewers(film_id: int, profile_ids: Optional[List[int]] = None) -> List[str]:
    """Get list of profile names who have viewed a film, optionally filtered by profile IDs"""
    with get_db() as conn:
        if profile_ids:
            placeholders = ','.join('?' * len(profile_ids))
            viewers = conn.execute(f"""
                SELECT p.name
                FROM viewed v
                JOIN profiles p ON v.profile_id = p.id
                WHERE v.film_id = ? AND v.profile_id IN ({placeholders})
                ORDER BY p.name
            """, [film_id] + profile_ids).fetchall()
        else:
            viewers = conn.execute("""
                SELECT p.name
                FROM viewed v
                JOIN profiles p ON v.profile_id = p.id
                WHERE v.film_id = ?
                ORDER BY p.name
            """, (film_id,)).fetchall()
        return [v['name'] for v in viewers]


# Archive operations
def toggle_archive(film_id: int) -> bool:
    """Toggle archive status for a film. Returns True if now archived, False if unarchived."""
    with get_db() as conn:
        film = conn.execute("SELECT is_archived FROM films WHERE id = ?", (film_id,)).fetchone()
        if not film:
            return False

        new_status = 0 if film['is_archived'] else 1
        conn.execute("UPDATE films SET is_archived = ? WHERE id = ?", (new_status, film_id))
        conn.commit()
        return bool(new_status)


def update_archive_metadata(film_id: int, archive_date: Optional[str], archive_commentary: Optional[str]) -> bool:
    """Update archive metadata for a film"""
    with get_db() as conn:
        film = conn.execute("SELECT id FROM films WHERE id = ?", (film_id,)).fetchone()
        if not film:
            return False

        conn.execute(
            "UPDATE films SET archive_date = ?, archive_commentary = ? WHERE id = ?",
            (archive_date, archive_commentary, film_id)
        )
        conn.commit()
        return True
