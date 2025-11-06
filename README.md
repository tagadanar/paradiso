# 🎬 Cinema Paradiso - Film Voting Application

A Python/FastAPI application for collaborative film selection. Search for films, add them to a shared list, and vote using anonymous profiles.

🍕🍹☀️ Pick your favorite films with friends!

## Features

- **Anonymous Profiles**: Create and switch between profiles without login
- **Film Search**: Search using the OMDb API (IMDb database)
- **Voting System**: Upvote, downvote, or mark films as neutral
- **Teaser Text**: Add hints when submitting films without spoiling
- **Viewed Tracking**: Mark films as watched and see who's viewed them
- **Archive System**: Archive watched films with ratings (1-5 stars), comments, and viewing dates
- **Smart Filters**: Genre filter (All/Horror/Non-Horror), vote filters, multi-profile filtering
- **Spoiler Protection**: Film details hidden behind toggle button
- **Fullscreen Posters**: Click any poster for fullscreen view

## Tech Stack

- **Backend**: FastAPI (Python 3.12) + SQLite3
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Movie API**: OMDb API
- **Server**: Uvicorn

## Setup

### 1. Get OMDb API Key

1. Visit [OMDb API](https://www.omdbapi.com/apikey.aspx)
2. Select "FREE" (1,000 daily requests)
3. Activate via email and copy your API key

### 2. Configure Environment

Edit `.env.local`:

```env
OMDB_API_KEY=your_actual_api_key_here
```

### 3. Install & Run

```bash
pip3 install -r requirements.txt
python3 -m uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000)

## Usage

1. **Create Profile**: Enter name and click "Create"
2. **Add Films**: Search films, click to add, optionally add teaser text
3. **Vote**: Click 👍 Upvote, ➖ Neutral, or 👎 Downvote (hover to see voters)
4. **View Details**: Click "Show Details" for plot, cast, director
5. **Mark Viewed**: Use 👁️ button to track watched films
6. **Filter**: Use 🎃🎅 for horror filter, vote filters (⚪ Unvoted, 👍 Upvotes, etc.)
7. **Archive**: Click 📦 to archive watched films, add ratings and comments

## API Endpoints

### Profiles
- `GET /api/profiles` - Get all profiles
- `POST /api/profiles` - Create profile
- `DELETE /api/profiles/{profile_id}` - Delete profile

### Films
- `GET /api/search?q={query}` - Search OMDb
- `GET /api/films` - Get active films
- `GET /api/films/filtered?profileIds={ids}` - Get films filtered by profiles
- `POST /api/films` - Add film
- `DELETE /api/films/{film_id}` - Delete film

### Voting
- `POST /api/vote` - Vote (1=upvote, -1=downvote, 2=neutral, 0=remove)
- `GET /api/vote?profileId={id}` - Get user votes
- `GET /api/films/{film_id}/voters` - Get voters

### Viewed & Archive
- `POST /api/viewed/toggle` - Toggle viewed status
- `GET /api/films/{film_id}/viewers` - Get viewers
- `GET /api/films/archived/list` - Get archived films
- `POST /api/films/archive/toggle` - Archive/unarchive film
- `POST /api/films/archive/metadata` - Update archive metadata

### Ratings & Comments
- `POST /api/films/{film_id}/rating` - Rate archived film (1-5)
- `GET /api/films/{film_id}/ratings` - Get ratings
- `POST /api/films/{film_id}/comment` - Add comment
- `GET /api/films/{film_id}/comments` - Get comments

## Project Structure

```
paradiso/
├── main.py                     # FastAPI routes
├── database.py                 # SQLite operations
├── omdb.py                     # OMDb API client
├── static/index.html           # Frontend SPA
├── .env.local                  # Environment variables
├── requirements.txt            # Dependencies
└── films.db                    # SQLite database
```

### Database Tables

- **profiles**: User profiles
- **films**: Film info (title, year, poster, genre, plot, teaser, archive status)
- **votes**: Film votes (-1, 1, or 2 for neutral)
- **viewed**: Viewed tracking
- **archive_ratings**: Star ratings (1-5) for archived films
- **archive_comments**: Comments for archived films

## Docker Deployment

```bash
docker build -t paradiso .
docker run -d --name paradiso -p 8000:8000 -e OMDB_API_KEY=your_key paradiso
```

Or use Docker Compose:

```bash
docker-compose up -d
```

## Development

Run with auto-reload:
```bash
python3 -m uvicorn main:app --reload
```

API docs:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## License

MIT
