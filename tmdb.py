import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "8265bd1679663a7ea12ac168da84d2e8")  # Free API key
TMDB_BASE_URL = "https://api.themoviedb.org/3"

session = requests.Session()


async def get_movie_by_imdb_id(imdb_id: str):
    """Get movie details from TMDb using IMDb ID"""
    try:
        # First, find the TMDb ID using IMDb ID
        response = session.get(
            f"{TMDB_BASE_URL}/find/{imdb_id}",
            params={
                "api_key": TMDB_API_KEY,
                "external_source": "imdb_id"
            },
            timeout=10
        )
        data = response.json()

        if not data.get("movie_results"):
            return None

        movie = data["movie_results"][0]

        # Return relevant data including original_title
        return {
            "original_title": movie.get("original_title"),
            "title": movie.get("title"),
            "original_language": movie.get("original_language")
        }
    except Exception as e:
        print(f"TMDb API error: {e}")
        return None
