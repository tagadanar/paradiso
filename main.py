from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import database as db
import omdb
from urllib.parse import quote_plus
import os

app = FastAPI(
    title="Paradiso - Film Voting App",
    root_path="/paradiso"  # This tells FastAPI it's behind a proxy at /paradiso
)

# Initialize database
db.init_db()

# Pydantic models
class ProfileCreate(BaseModel):
    name: str


class FilmAdd(BaseModel):
    imdbId: str


class VoteCreate(BaseModel):
    filmId: int
    profileId: int
    vote: int  # 1, -1, or 0


# API Endpoints
@app.get("/api/profiles")
async def get_profiles():
    return db.get_profiles()


@app.post("/api/profiles")
async def create_profile(profile: ProfileCreate):
    existing = db.get_profile_by_name(profile.name.strip())
    if existing:
        raise HTTPException(status_code=409, detail="Profile name already exists")

    return db.create_profile(profile.name.strip())


@app.delete("/api/profiles/{profile_id}")
async def delete_profile(profile_id: int):
    success = db.delete_profile(profile_id)
    if not success:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"message": "Profile deleted successfully"}


@app.get("/api/search")
async def search_films(q: str):
    results = await omdb.search_movies(q)

    if results.get("Response") == "False":
        return {"results": [], "error": results.get("Error")}

    return {"results": results.get("Search", [])}


@app.get("/api/films")
async def get_films():
    return db.get_films_with_votes()


@app.get("/api/films/filtered")
async def get_films_filtered(profileIds: str):
    """Get films with votes filtered by specific profile IDs (comma-separated)"""
    try:
        profile_ids = [int(pid) for pid in profileIds.split(',')]
        if not profile_ids:
            raise HTTPException(status_code=400, detail="No profile IDs provided")
        return db.get_films_with_votes_filtered(profile_ids)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid profile IDs")


@app.post("/api/films")
async def add_film(film: FilmAdd):
    existing = db.get_film_by_imdb_id(film.imdbId)
    if existing:
        raise HTTPException(status_code=409, detail="Film already added")

    movie_details = await omdb.get_movie_details(film.imdbId)

    if movie_details.get("Response") == "False":
        raise HTTPException(status_code=404, detail=movie_details.get("Error", "Movie not found"))

    trailer_url = f"https://www.youtube.com/results?search_query={quote_plus(movie_details['Title'] + ' ' + movie_details['Year'] + ' trailer')}"

    return db.create_film(
        imdb_id=movie_details["imdbID"],
        title=movie_details["Title"],
        year=movie_details["Year"],
        poster_url=movie_details["Poster"] if movie_details["Poster"] != "N/A" else None,
        genre=movie_details.get("Genre", ""),
        director=movie_details.get("Director", ""),
        actors=movie_details.get("Actors", ""),
        plot=movie_details.get("Plot", ""),
        trailer_url=trailer_url
    )


@app.delete("/api/films/{film_id}")
async def delete_film(film_id: int):
    success = db.delete_film(film_id)
    if not success:
        raise HTTPException(status_code=404, detail="Film not found")
    return {"message": "Film deleted successfully"}


@app.post("/api/vote")
async def create_vote(vote: VoteCreate):
    if vote.vote not in [1, -1, 0, 2]:
        raise HTTPException(status_code=400, detail="Vote must be 1 (upvote), -1 (downvote), 2 (neutral), or 0 (remove)")

    profile = db.get_profile_by_id(vote.profileId)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    film = db.get_film_by_id(vote.filmId)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    result = db.create_or_update_vote(vote.filmId, vote.profileId, vote.vote)

    return {"message": f"Vote {result}"}


@app.get("/api/vote")
async def get_user_votes(profileId: int):
    return db.get_user_votes(profileId)


@app.get("/api/films/{film_id}/voters")
async def get_film_voters(film_id: int):
    return db.get_film_voters(film_id)


# Serve static frontend - simple file reading without threading
@app.get("/")
async def serve_index():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="text/html")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Frontend not found")
