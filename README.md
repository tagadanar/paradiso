# 🎬 Cinema Paradiso - Film Voting Application

A Python/FastAPI application that allows users to search for films, add them to a shared list, and vote on them using anonymous profiles.

🍕🍹☀️ Pick your favorite films collaboratively with friends!

## Features

- **Anonymous Profiles**: Create and switch between multiple identities without login
- **Film Search**: Search for films using the OMDb API (IMDb database)
- **Add Films**: Add films to the shared voting list
- **Voting System**: Upvote or downvote films with one vote per profile per film
- **Spoiler Protection**: Film details (genre, director, actors, plot) are hidden behind a toggle button
- **Trailer Links**: YouTube trailer search links (revealed on click)
- **Real-time Updates**: Vote counts update immediately
- **Profile Persistence**: Selected profile is saved in browser localStorage

## Tech Stack

- **Backend**: FastAPI (Python 3.12)
- **Database**: SQLite3 (native Python support)
- **Movie API**: OMDb API
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Server**: Uvicorn (ASGI server)

## Setup Instructions

### 1. Get an OMDb API Key

1. Visit [OMDb API](https://www.omdbapi.com/apikey.aspx)
2. Select "FREE" (1,000 daily requests)
3. Enter your email
4. Check your email for the activation link
5. Click the link to activate your API key
6. Copy your API key

### 2. Configure Environment Variables

Edit the `.env.local` file in the project root:

```env
OMDB_API_KEY=your_actual_api_key_here
```

Replace `your_actual_api_key_here` with your actual OMDb API key.

### 3. Install Dependencies

```bash
pip3 install -r requirements.txt --break-system-packages
```

Or use a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Run the Application

```bash
python3 -m uvicorn main:app --reload
```

Or run in the background:

```bash
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## Usage

### 1. Create a Profile

- Enter a name in the "New profile name" field at the top
- Click "Create"
- Your profile will be selected automatically

### 2. Search for Films

- Use the search box to find films by title
- Click on a film from the results to add it to the list

### 3. Vote on Films

- Select your profile from the top bar
- Click 👍 Upvote or 👎 Downvote on any film
- Click again to remove your vote

### 4. View Film Details

- Click "🔽 Show Details (Spoilers)" to reveal genre, director, actors, and plot
- Click "🎬 Show Trailer" to get a YouTube search link for the trailer

## API Endpoints

- `GET /api/profiles` - Get all profiles
- `POST /api/profiles` - Create a new profile
- `GET /api/search?q={query}` - Search films from OMDb
- `GET /api/films` - Get all films with vote counts
- `POST /api/films` - Add a film (requires imdbId)
- `GET /api/vote?profileId={id}` - Get user's votes
- `POST /api/vote` - Cast/update/remove a vote

## Project Structure

```
paradiso/
├── main.py                 # FastAPI application & routes
├── database.py             # SQLite database operations
├── omdb.py                 # OMDb API client
├── static/
│   └── index.html          # Frontend UI
├── .env.local              # Environment variables
├── requirements.txt        # Python dependencies
└── films.db                # SQLite database (auto-created)
```

## Docker Deployment

### Build and run with Docker

```bash
docker build -t paradiso .
docker run -d \
  --name paradiso \
  --restart unless-stopped \
  -p 8000:8000 \
  -e OMDB_API_KEY=your_api_key_here \
  paradiso
```

### Using Docker Compose

```bash
docker-compose up -d
```

**Note:** Make sure to set the `OMDB_API_KEY` environment variable in your docker-compose.yml or pass it via `-e` flag.

## Development

To run with auto-reload:

```bash
python3 -m uvicorn main:app --reload
```

To access API docs:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Features in Detail

### Voting System
- **Upvote** (👍): Adds +1 to the film's score
- **Neutral** (➖): Mark a film as seen without affecting score
- **Downvote** (👎): Adds -1 to the film's score
- Hover over vote buttons to see who voted

### Filters
- **🎃 Spooky Season**: Filter horror/thriller/mystery films
- **⚪ Unvoted**: Show only films you haven't voted on
- **👍 My Upvotes**: Show films you upvoted
- **➖ My Neutral**: Show films you marked neutral
- **👎 My Downvotes**: Show films you downvoted

### Search
Real-time search bar to filter films by title, director, actor, genre, or plot keywords.

## License

MIT
