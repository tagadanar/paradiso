import os
import httpx
from dotenv import load_dotenv

load_dotenv('.env.local')

OMDB_API_KEY = os.getenv("OMDB_API_KEY")
OMDB_BASE_URL = "https://www.omdbapi.com/"


async def search_movies(query: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            OMDB_BASE_URL,
            params={"apikey": OMDB_API_KEY, "s": query, "type": "movie"}
        )
        return response.json()


async def get_movie_details(imdb_id: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            OMDB_BASE_URL,
            params={"apikey": OMDB_API_KEY, "i": imdb_id, "plot": "full"}
        )
        return response.json()
