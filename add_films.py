#!/usr/bin/env python3
import asyncio
import httpx

# List of films to add (title, year if specified)
FILMS = [
    ("Border", "2018"),
    ("The Wailing", "2016"),
    ("Train to Busan", "2016"),
    ("The Babadook", "2014"),
    ("A Quiet Place", "2018"),
    ("Night of The Demon", None),
    ("What We Do In The Shadows", None),
    ("Candyman", None),
    ("Trick 'r Treat", None),
    ("Eyes Wide Shut", None),
    ("Le Temps des Gitans", None),  # Time of the Gypsies
    ("Dieu Vomit les Tièdes", None),
    ("A White White Day", None),
    ("Upstream Color", None),
    ("Platoon", None),
    ("Pan's Labyrinth", None),
    ("Tinker Tailor Soldier Spy", None),
    ("The Last Temptation of Christ", None),
    ("The Third Man", None),  # Le Troisième Homme
    ("Conclave", None),
    ("Life of Brian", None),  # La Vie de Brian
    ("Brazil", None),
    ("Barry Lyndon", None),
    ("Lawrence of Arabia", None),  # Lawrence d'Arabie
]

BASE_URL = "http://localhost:8000"

async def search_and_add_film(title, year=None):
    """Search for a film and add it to the database"""
    async with httpx.AsyncClient() as client:
        # Search for the film
        search_query = f"{title} {year}" if year else title
        print(f"\n🔍 Searching for: {search_query}")

        try:
            search_res = await client.get(f"{BASE_URL}/api/search", params={"q": search_query})
            search_data = search_res.json()

            if not search_data.get("results"):
                print(f"   ❌ Not found: {title}")
                return False

            # Get the first result (most relevant)
            result = search_data["results"][0]
            imdb_id = result["imdbID"]
            film_title = result["Title"]
            film_year = result["Year"]

            print(f"   ✓ Found: {film_title} ({film_year}) - {imdb_id}")

            # Try to add the film
            add_res = await client.post(
                f"{BASE_URL}/api/films",
                json={"imdbId": imdb_id}
            )

            if add_res.status_code == 200:
                print(f"   ✅ Added successfully!")
                return True
            elif add_res.status_code == 409:
                print(f"   ⚠️  Already in database")
                return True
            else:
                error = add_res.json()
                print(f"   ❌ Failed to add: {error.get('detail', 'Unknown error')}")
                return False

        except Exception as e:
            print(f"   ❌ Error: {e}")
            return False

async def main():
    print("🎬 Adding films to Cinema Paradiso database...")
    print("=" * 60)

    added = 0
    failed = 0

    for title, year in FILMS:
        success = await search_and_add_film(title, year)
        if success:
            added += 1
        else:
            failed += 1
        await asyncio.sleep(0.5)  # Be nice to the API

    print("\n" + "=" * 60)
    print(f"✅ Added: {added}")
    print(f"❌ Failed: {failed}")
    print(f"📊 Total: {len(FILMS)}")

if __name__ == "__main__":
    asyncio.run(main())
