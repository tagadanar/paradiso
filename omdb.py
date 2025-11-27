import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

OMDB_API_KEY = os.getenv("OMDB_API_KEY")
OMDB_BASE_URL = "https://www.omdbapi.com/"

# Use requests library which is simpler and more lightweight than httpx
# This avoids thread exhaustion issues on resource-constrained servers
session = requests.Session()


async def search_movies(query: str, page: int = 1):
    # Use requests in blocking mode - FastAPI will handle this fine
    response = session.get(
        OMDB_BASE_URL,
        params={"apikey": OMDB_API_KEY, "s": query, "type": "movie", "page": page},
        timeout=10
    )
    return response.json()


async def get_movie_details(imdb_id: str):
    # Use requests in blocking mode - FastAPI will handle this fine
    response = session.get(
        OMDB_BASE_URL,
        params={"apikey": OMDB_API_KEY, "i": imdb_id, "plot": "full"},
        timeout=10
    )
    return response.json()
