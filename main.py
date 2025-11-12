from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import database as db
import omdb
import tmdb
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
    teaserText: str | None = None
    profileId: int | None = None


class VoteCreate(BaseModel):
    filmId: int
    profileId: int
    vote: int  # 1, -1, or 0


class TeaserUpdate(BaseModel):
    filmId: int
    teaserText: str
    profileId: int | None = None


class ViewedToggle(BaseModel):
    filmId: int
    profileId: int


class ArchiveToggle(BaseModel):
    filmId: int


class ArchiveMetadataUpdate(BaseModel):
    filmId: int
    archiveDate: str | None = None
    archiveCommentary: str | None = None


class RatingCreate(BaseModel):
    profileId: int
    rating: int  # 1-5


class CommentCreate(BaseModel):
    profileId: int
    commentText: str


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

    # Get original title from TMDb (OMDb doesn't provide this)
    original_title = None
    tmdb_data = await tmdb.get_movie_by_imdb_id(film.imdbId)
    if tmdb_data and tmdb_data.get("original_title"):
        # Only store if different from English title
        if tmdb_data["original_title"] != movie_details["Title"]:
            original_title = tmdb_data["original_title"]

    # Use original title for trailer search if available, otherwise use English title
    search_title = original_title if original_title else movie_details['Title']
    trailer_url = f"https://www.youtube.com/results?search_query={quote_plus(search_title + ' ' + movie_details['Year'] + ' trailer')}"

    return db.create_film(
        imdb_id=movie_details["imdbID"],
        title=movie_details["Title"],
        year=movie_details["Year"],
        poster_url=movie_details["Poster"] if movie_details["Poster"] != "N/A" else None,
        genre=movie_details.get("Genre", ""),
        director=movie_details.get("Director", ""),
        actors=movie_details.get("Actors", ""),
        plot=movie_details.get("Plot", ""),
        trailer_url=trailer_url,
        teaser_text=film.teaserText,
        submitted_by_profile_id=film.profileId,
        original_title=original_title
    )


@app.delete("/api/films/{film_id}")
async def delete_film(film_id: int):
    success = db.delete_film(film_id)
    if not success:
        raise HTTPException(status_code=404, detail="Film not found")
    return {"message": "Film deleted successfully"}


@app.post("/api/films/teaser")
async def update_teaser(teaser: TeaserUpdate):
    film = db.get_film_by_id(teaser.filmId)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    success = db.update_film_teaser(teaser.filmId, teaser.teaserText, teaser.profileId)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update teaser")

    return {"message": "Teaser updated successfully"}


@app.delete("/api/films/{film_id}/teaser")
async def delete_teaser(film_id: int):
    film = db.get_film_by_id(film_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    success = db.delete_film_teaser(film_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete teaser")

    return {"message": "Teaser deleted successfully"}


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


@app.post("/api/viewed/toggle")
async def toggle_viewed(viewed: ViewedToggle):
    profile = db.get_profile_by_id(viewed.profileId)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    film = db.get_film_by_id(viewed.filmId)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    is_viewed = db.toggle_viewed(viewed.filmId, viewed.profileId)

    return {"viewed": is_viewed}


@app.get("/api/viewed")
async def get_user_viewed(profileId: int):
    return db.get_user_viewed(profileId)


@app.get("/api/films/{film_id}/viewers")
async def get_film_viewers_list(film_id: int, profileIds: str = None):
    """Get viewers for a film, optionally filtered by profile IDs (comma-separated)"""
    profile_ids = None
    if profileIds:
        try:
            profile_ids = [int(pid) for pid in profileIds.split(',')]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid profile IDs")

    return db.get_film_viewers(film_id, profile_ids)


@app.get("/api/films/archived/list")
async def get_archived_films():
    """Get all archived films"""
    return db.get_archived_films_with_votes()


@app.get("/api/films/archived/filtered")
async def get_archived_films_filtered(profileIds: str):
    """Get archived films with votes filtered by specific profile IDs (comma-separated)"""
    try:
        profile_ids = [int(pid) for pid in profileIds.split(',')]
        if not profile_ids:
            raise HTTPException(status_code=400, detail="No profile IDs provided")
        return db.get_archived_films_with_votes_filtered(profile_ids)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid profile IDs")


@app.post("/api/films/archive/toggle")
async def toggle_film_archive(archive: ArchiveToggle):
    """Toggle archive status for a film"""
    film = db.get_film_by_id(archive.filmId)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    is_archived = db.toggle_archive(archive.filmId)
    return {"archived": is_archived}


@app.post("/api/films/archive/metadata")
async def update_film_archive_metadata(metadata: ArchiveMetadataUpdate):
    """Update archive metadata (date and commentary) for a film"""
    film = db.get_film_by_id(metadata.filmId)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    success = db.update_archive_metadata(
        metadata.filmId,
        metadata.archiveDate,
        metadata.archiveCommentary
    )

    if success:
        return {"message": "Archive metadata updated"}
    else:
        raise HTTPException(status_code=500, detail="Failed to update archive metadata")


# Archive ratings endpoints
@app.post("/api/films/{film_id}/rating")
async def create_or_update_rating(film_id: int, rating_data: RatingCreate):
    """Create or update a star rating (1-5) for an archived film"""
    # Verify film exists and is archived
    film = db.get_film_by_id(film_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    if not film.get('is_archived'):
        raise HTTPException(status_code=400, detail="Can only rate archived films")

    # Verify profile exists
    profile = db.get_profile_by_id(rating_data.profileId)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Validate rating
    if rating_data.rating < 1 or rating_data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    try:
        result = db.create_or_update_rating(film_id, rating_data.profileId, rating_data.rating)
        return {"message": f"Rating {result}", "rating": rating_data.rating}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/films/{film_id}/ratings")
async def get_film_ratings(film_id: int):
    """Get all ratings for a film"""
    film = db.get_film_by_id(film_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    return db.get_film_ratings(film_id)


@app.delete("/api/films/{film_id}/rating/{profile_id}")
async def delete_rating(film_id: int, profile_id: int):
    """Delete a rating"""
    success = db.delete_rating(film_id, profile_id)
    if not success:
        raise HTTPException(status_code=404, detail="Rating not found")
    return {"message": "Rating deleted successfully"}


# Archive comments endpoints
@app.post("/api/films/{film_id}/comment")
async def create_or_update_comment(film_id: int, comment_data: CommentCreate):
    """Create or update a comment for an archived film"""
    # Verify film exists and is archived
    film = db.get_film_by_id(film_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    if not film.get('is_archived'):
        raise HTTPException(status_code=400, detail="Can only comment on archived films")

    # Verify profile exists
    profile = db.get_profile_by_id(comment_data.profileId)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        result = db.create_or_update_comment(film_id, comment_data.profileId, comment_data.commentText)
        return {"message": f"Comment {result}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/films/{film_id}/comments")
async def get_film_comments(film_id: int):
    """Get all comments for a film"""
    film = db.get_film_by_id(film_id)
    if not film:
        raise HTTPException(status_code=404, detail="Film not found")

    return db.get_film_comments(film_id)


@app.delete("/api/films/{film_id}/comment/{profile_id}")
async def delete_comment(film_id: int, profile_id: int):
    """Delete a comment"""
    success = db.delete_comment(film_id, profile_id)
    if not success:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"message": "Comment deleted successfully"}


# Backfill endpoint for original titles
@app.post("/api/admin/backfill-original-titles")
async def backfill_original_titles():
    """Backfill original titles for all existing films using TMDb API"""
    films = db.get_all_films()
    updated = 0
    failed = 0
    skipped = 0

    results = []

    for film in films:
        film_id = film['id']
        imdb_id = film['imdb_id']
        current_title = film['title']
        current_original = film.get('original_title')

        # Skip if already has original title
        if current_original:
            skipped += 1
            continue

        # Fetch from TMDb
        try:
            tmdb_data = await tmdb.get_movie_by_imdb_id(imdb_id)
            if tmdb_data and tmdb_data.get("original_title"):
                original_title = tmdb_data["original_title"]

                # Only update if different from current title
                if original_title != current_title:
                    success = db.update_film_original_title(film_id, original_title)
                    if success:
                        updated += 1
                        results.append({
                            "film_id": film_id,
                            "title": current_title,
                            "original_title": original_title,
                            "status": "updated"
                        })
                    else:
                        failed += 1
                        results.append({
                            "film_id": film_id,
                            "title": current_title,
                            "status": "failed_to_update"
                        })
                else:
                    skipped += 1
            else:
                skipped += 1
        except Exception as e:
            failed += 1
            results.append({
                "film_id": film_id,
                "title": current_title,
                "status": f"error: {str(e)}"
            })

    return {
        "total_films": len(films),
        "updated": updated,
        "failed": failed,
        "skipped": skipped,
        "results": results
    }


# Serve static frontend - simple file reading without threading
@app.get("/")
async def serve_index():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="text/html")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Frontend not found")


@app.get("/static/styles.css")
async def serve_css():
    try:
        with open("static/styles.css", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="text/css")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="CSS file not found")


@app.get("/static/app.js")
async def serve_js():
    try:
        with open("static/app.js", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/javascript")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="JS file not found")
