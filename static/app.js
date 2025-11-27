        // Theme Management
        function initTheme() {
            // Check localStorage first, then browser preference, default to dark
            const savedTheme = localStorage.getItem('theme');
            let theme;

            if (savedTheme) {
                theme = savedTheme;
            } else {
                // Check if browser has a preference
                const hasBrowserPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ||
                                            window.matchMedia('(prefers-color-scheme: light)').matches;

                if (hasBrowserPreference) {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                } else {
                    // No browser preference, default to dark
                    theme = 'dark';
                }
                localStorage.setItem('theme', theme);
            }

            applyTheme(theme);
        }

        function applyTheme(theme) {
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                document.getElementById('themeIcon').textContent = '☀️';
            } else {
                document.documentElement.removeAttribute('data-theme');
                document.getElementById('themeIcon').textContent = '🌙';
            }
        }

        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        }

        // Initialize theme immediately
        initTheme();

        let profiles = [];
        let selectedProfile = null;
        let films = [];
        let userVotes = {};
        let userViewed = []; // Array of film IDs viewed by selected profile

        // Search pagination state
        let currentSearchQuery = '';
        let currentSearchPage = 1;
        let currentSearchTotalResults = 0;
        let currentSearchResults = [];
        let horrorFilter = 'all'; // 'all', 'spooky', 'unspooky'
        let voteFilter = null; // null, 'unvoted', 'upvoted', 'neutral', 'downvoted'
        let filmSearchQuery = '';
        let selectedIdentityIds = []; // Array of profile IDs for identity filter
        let showArchived = false; // Toggle between regular and archived films
        let filmRatings = {}; // Map of filmId -> array of rating objects
        let sortMode = 'score'; // 'score' or 'ratio'
        let archivedSortMode = 'date'; // 'date' or 'rating' - for archived films only
        let filmComments = {}; // Map of filmId -> array of comment objects

        // Handle broken poster images
        function handleImageError(img) {
            img.classList.add('error');
            // Add placeholder if not already present
            if (!img.nextElementSibling || !img.nextElementSibling.classList.contains('poster-placeholder')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'poster-placeholder';
                placeholder.textContent = '🎬';
                img.parentNode.insertBefore(placeholder, img.nextSibling);
            }
        }

        // Load profiles and films on page load
        async function init() {
            await loadProfiles();
            await loadFilms();
            updateSortButton();
            updateFilterButtons();
            const savedProfileId = localStorage.getItem('selectedProfileId');
            if (savedProfileId && profiles.length > 0) {
                const profile = profiles.find(p => p.id === parseInt(savedProfileId));
                if (profile) selectProfile(profile);
            }

            // Add keyboard listener for ESC key to close fullscreen poster
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closePosterFullscreen();
                }
            });
        }

        async function loadProfiles() {
            try {
                const res = await fetch('/paradiso/api/profiles');
                profiles = await res.json();
                renderProfiles();
            } catch (error) {
                console.error('Failed to load profiles:', error);
            }
        }

        function renderProfiles() {
            const container = document.getElementById('profiles');
            container.innerHTML = profiles.map(p => `
                <div class="profile-item">
                    <button class="profile-btn ${selectedProfile?.id === p.id ? 'active' : ''}"
                            onclick='selectProfile(${JSON.stringify(p)})'>
                        ${p.name}
                    </button>
                    <button class="profile-delete" onclick="deleteProfile(${p.id}, '${p.name.replace(/'/g, "\\'")}')">×</button>
                </div>
            `).join('');
            renderIdentityCheckboxes();
        }

        async function selectProfile(profile) {
            selectedProfile = profile;
            localStorage.setItem('selectedProfileId', profile.id);
            document.getElementById('selectedProfile').innerHTML = `✓ Voting as: ${profile.name}`;
            renderProfiles();
            await loadUserVotes();
            await loadUserViewed();
            renderFilms();
        }

        async function createProfile() {
            const name = document.getElementById('newProfileName').value.trim();
            if (!name) return;

            try {
                const res = await fetch('/paradiso/api/profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });

                if (res.ok) {
                    const profile = await res.json();
                    profiles.push(profile);
                    selectProfile(profile);
                    document.getElementById('newProfileName').value = '';
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to create profile');
                }
            } catch (error) {
                console.error('Failed to create profile:', error);
                alert('Failed to create profile. Please try again.');
            }
        }

        async function deleteProfile(profileId, profileName) {
            if (!confirm(`Are you sure you want to delete profile "${profileName}"? This will also delete all votes by this profile.`)) {
                return;
            }

            const res = await fetch(`/paradiso/api/profiles/${profileId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                profiles = profiles.filter(p => p.id !== profileId);

                // If deleting currently selected profile, clear selection
                if (selectedProfile?.id === profileId) {
                    selectedProfile = null;
                    userVotes = {};
                    localStorage.removeItem('selectedProfileId');
                    document.getElementById('selectedProfile').innerHTML = '';
                }

                renderProfiles();
                await loadFilms();
            } else {
                const error = await res.json();
                alert(error.detail || 'Failed to delete profile');
            }
        }

        async function deleteFilm(filmId, filmTitle) {
            if (!confirm(`Are you sure you want to delete "${filmTitle}"? This will also delete all votes for this film.`)) {
                return;
            }

            const res = await fetch(`/paradiso/api/films/${filmId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                // Reload user votes and films to update vote counts
                if (selectedProfile) {
                    await loadUserVotes();
                }
                await loadFilms();
            } else {
                const error = await res.json();
                alert(error.detail || 'Failed to delete film');
            }
        }

        async function deleteTeaser(filmId, filmTitle) {
            if (!confirm(`Are you sure you want to delete the teaser for "${filmTitle}"?`)) {
                return;
            }

            const res = await fetch(`/paradiso/api/films/${filmId}/teaser`, {
                method: 'DELETE'
            });

            if (res.ok) {
                await loadFilms();
            } else {
                const error = await res.json();
                alert(error.detail || 'Failed to delete teaser');
            }
        }

        async function searchFilms(loadMore = false) {
            const query = document.getElementById('searchQuery').value.trim();
            if (!query) return;

            // If it's a new search, reset pagination
            if (!loadMore || query !== currentSearchQuery) {
                currentSearchQuery = query;
                currentSearchPage = 1;
                currentSearchResults = [];
            }

            try {
                const res = await fetch(`/paradiso/api/search?q=${encodeURIComponent(currentSearchQuery)}&page=${currentSearchPage}`);
                const data = await res.json();

                if (data.error) {
                    alert(`Search error: ${data.error}`);
                    return;
                }

                currentSearchTotalResults = data.totalResults || 0;

                if (loadMore) {
                    currentSearchResults = [...currentSearchResults, ...(data.results || [])];
                } else {
                    currentSearchResults = data.results || [];
                }

                renderSearchResults(currentSearchResults);
            } catch (error) {
                console.error('Failed to search films:', error);
                alert('Failed to search films. Please try again.');
            }
        }

        async function loadMoreSearchResults() {
            currentSearchPage++;
            await searchFilms(true);
        }

        function renderSearchResults(results) {
            const container = document.getElementById('searchResults');
            const closeBtn = document.getElementById('closeSearchBtn');

            // Check if there are more results to load (OMDb returns 10 per page)
            const hasMoreResults = results.length < currentSearchTotalResults;

            container.innerHTML = results.map(movie => `
                <div class="movie-card">
                    ${movie.Poster !== 'N/A' ? `<img src="${movie.Poster}" alt="${movie.Title}" onerror="handleImageError(this)">` : '<div class="poster-placeholder">🎬</div>'}
                    <h3>${movie.Title}</h3>
                    <p>${movie.Year}</p>
                    <button class="btn-add" onclick='addFilm("${movie.imdbID}", "${movie.Title.replace(/'/g, "&apos;")}")'>Add Film</button>
                </div>
            `).join('') + (hasMoreResults ? `
                <div class="load-more-container">
                    <button class="btn-load-more" onclick="loadMoreSearchResults()">
                        Load More (${results.length} of ${currentSearchTotalResults})
                    </button>
                </div>
            ` : '');

            // Show close button if there are results
            if (results.length > 0) {
                closeBtn.style.display = 'block';
            } else {
                closeBtn.style.display = 'none';
            }
        }

        function closeSearch() {
            document.getElementById('searchResults').innerHTML = '';
            document.getElementById('searchQuery').value = '';
            document.getElementById('closeSearchBtn').style.display = 'none';
            // Reset search pagination state
            currentSearchQuery = '';
            currentSearchPage = 1;
            currentSearchTotalResults = 0;
            currentSearchResults = [];
        }

        async function addFilm(imdbId, filmTitle) {
            try {
                // Show modal to get teaser text
                const result = await showAddFilmTeaserModal(filmTitle);

                // If user cancelled, don't add the film
                if (result.action === 'cancel') {
                    return;
                }

                // Prepare the request body
                const body = {
                    imdbId: imdbId,
                    teaserText: result.teaserText || null,
                    profileId: selectedProfile ? selectedProfile.id : null
                };

                const res = await fetch('/paradiso/api/films', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (res.ok) {
                    closeSearch();
                    await loadFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to add film');
                }
            } catch (error) {
                console.error('Failed to add film:', error);
                alert('Failed to add film. Please try again.');
            }
        }

        async function loadFilms() {
            try {
                let url;
                if (showArchived) {
                    url = '/paradiso/api/films/archived/list';
                    // Use filtered endpoint if identities are selected
                    if (selectedIdentityIds.length > 0) {
                        url = `/paradiso/api/films/archived/filtered?profileIds=${selectedIdentityIds.join(',')}`;
                    }
                } else {
                    url = '/paradiso/api/films';
                    // Use filtered endpoint if identities are selected
                    if (selectedIdentityIds.length > 0) {
                        url = `/paradiso/api/films/filtered?profileIds=${selectedIdentityIds.join(',')}`;
                    }
                }
                const res = await fetch(url);
                films = await res.json();

                // Load ratings and comments for archived films
                if (showArchived) {
                    await Promise.all(films.map(async (film) => {
                        await loadFilmRatings(film.id);
                        await loadFilmComments(film.id);
                    }));
                }

                renderFilms();
            } catch (error) {
                console.error('Failed to load films:', error);
            }
        }

        async function loadUserVotes() {
            if (!selectedProfile) {
                userVotes = {};
                return;
            }
            try {
                const res = await fetch(`/paradiso/api/vote?profileId=${selectedProfile.id}`);
                userVotes = await res.json();
            } catch (error) {
                console.error('Failed to load user votes:', error);
                userVotes = {};
            }
        }

        async function loadUserViewed() {
            if (!selectedProfile) {
                userViewed = [];
                return;
            }
            try {
                const res = await fetch(`/paradiso/api/viewed?profileId=${selectedProfile.id}`);
                userViewed = await res.json();
            } catch (error) {
                console.error('Failed to load user viewed:', error);
                userViewed = [];
            }
        }

        async function vote(filmId, voteValue) {
            if (!selectedProfile) {
                alert('Please select a profile first!');
                return;
            }

            const currentVote = userVotes[filmId];
            const newVote = currentVote === voteValue ? 0 : voteValue;

            try {
                const res = await fetch('/paradiso/api/vote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filmId, profileId: selectedProfile.id, vote: newVote })
                });

                if (res.ok) {
                    // Load user votes first, then reload films
                    await loadUserVotes();
                    await loadFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to vote');
                }
            } catch (error) {
                console.error('Failed to vote:', error);
                alert('Failed to vote. Please try again.');
            }
        }

        async function toggleViewed(filmId) {
            if (!selectedProfile) {
                alert('Please select a profile first!');
                return;
            }

            try {
                const res = await fetch('/paradiso/api/viewed/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filmId, profileId: selectedProfile.id })
                });

                if (res.ok) {
                    const data = await res.json();
                    // Update local state
                    if (data.viewed) {
                        if (!userViewed.includes(filmId)) {
                            userViewed.push(filmId);
                        }
                    } else {
                        userViewed = userViewed.filter(id => id !== filmId);
                    }
                    renderFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to toggle viewed status');
                }
            } catch (error) {
                console.error('Failed to toggle viewed:', error);
                alert('Failed to toggle viewed status. Please try again.');
            }
        }

        let voterTooltip = null;
        let tooltipTimeout = null;

        async function showVoterTooltip(event, filmId) {
            clearTimeout(tooltipTimeout);

            if (!voterTooltip) {
                voterTooltip = document.createElement('div');
                voterTooltip.className = 'voter-tooltip';
                document.body.appendChild(voterTooltip);
            }

            // Position and show tooltip immediately
            const rect = event.currentTarget.getBoundingClientRect();
            voterTooltip.style.left = rect.left + 'px';
            voterTooltip.style.top = (rect.bottom + 8) + 'px';
            voterTooltip.innerHTML = '<div>Loading...</div>';
            voterTooltip.classList.add('show');

            try {
                // Fetch and update content
                const res = await fetch(`/paradiso/api/films/${filmId}/voters`);
                const voters = await res.json();

                let html = '';
                if (voters.upvoters && voters.upvoters.length > 0) {
                    html += `<div class="voter-section"><strong>👍 Upvoted by:</strong> ${voters.upvoters.join(', ')}</div>`;
                }
                if (voters.neutralvoters && voters.neutralvoters.length > 0) {
                    html += `<div class="voter-section"><strong>➖ Neutral:</strong> ${voters.neutralvoters.join(', ')}</div>`;
                }
                if (voters.downvoters && voters.downvoters.length > 0) {
                    html += `<div class="voter-section"><strong>👎 Downvoted by:</strong> ${voters.downvoters.join(', ')}</div>`;
                }
                if ((!voters.upvoters || voters.upvoters.length === 0) &&
                    (!voters.downvoters || voters.downvoters.length === 0) &&
                    (!voters.neutralvoters || voters.neutralvoters.length === 0)) {
                    html = '<div>No votes yet</div>';
                }

                // Only update if tooltip is still visible
                if (voterTooltip.classList.contains('show')) {
                    voterTooltip.innerHTML = html;
                }
            } catch (error) {
                console.error('Failed to load voters:', error);
                if (voterTooltip.classList.contains('show')) {
                    voterTooltip.innerHTML = '<div>Failed to load voters</div>';
                }
            }
        }

        function hideVoterTooltip() {
            tooltipTimeout = setTimeout(() => {
                if (voterTooltip) {
                    voterTooltip.classList.remove('show');
                }
            }, 150);
        }

        async function showViewerTooltip(event, filmId) {
            clearTimeout(tooltipTimeout);

            if (!voterTooltip) {
                voterTooltip = document.createElement('div');
                voterTooltip.className = 'voter-tooltip';
                document.body.appendChild(voterTooltip);
            }

            // Position and show tooltip immediately
            const rect = event.currentTarget.getBoundingClientRect();
            voterTooltip.style.left = rect.left + 'px';
            voterTooltip.style.top = (rect.bottom + 8) + 'px';
            voterTooltip.innerHTML = '<div>Loading...</div>';
            voterTooltip.classList.add('show');

            try {
                // Fetch and update content, filtered by selected identities if active
                let url = `/paradiso/api/films/${filmId}/viewers`;
                if (selectedIdentityIds.length > 0) {
                    url += `?profileIds=${selectedIdentityIds.join(',')}`;
                }
                const res = await fetch(url);
                const viewers = await res.json();

                let html = '';
                if (viewers && viewers.length > 0) {
                    html = `<div class="voter-section"><strong>👁️ Viewed by:</strong> ${viewers.join(', ')}</div>`;
                } else {
                    if (selectedIdentityIds.length > 0) {
                        html = '<div>Not viewed by selected identities yet</div>';
                    } else {
                        html = '<div>Not viewed by anyone yet</div>';
                    }
                }

                // Only update if tooltip is still visible
                if (voterTooltip.classList.contains('show')) {
                    voterTooltip.innerHTML = html;
                }
            } catch (error) {
                console.error('Failed to load viewers:', error);
                if (voterTooltip.classList.contains('show')) {
                    voterTooltip.innerHTML = '<div>Failed to load viewers</div>';
                }
            }
        }

        function toggleInfo(filmId) {
            const elem = document.getElementById(`info-${filmId}`);
            elem.classList.toggle('show');
        }

        function togglePlot(filmId) {
            const elem = document.getElementById(`plot-${filmId}`);
            elem.classList.toggle('show');
        }

        function toggleTrailer(filmId) {
            const elem = document.getElementById(`trailer-${filmId}`);
            elem.classList.toggle('show');
        }

        function cycleHorrorFilter() {
            if (showArchived) return; // Don't filter in archived mode
            const btn = document.getElementById('horrorFilterBtn');

            // Cycle through states: all -> spooky -> unspooky -> all
            if (horrorFilter === 'all') {
                horrorFilter = 'spooky';
                btn.textContent = '🎃 Spooky';
                btn.classList.add('active');
                btn.classList.remove('btn-unspooky');
                btn.classList.add('btn-spooky');
            } else if (horrorFilter === 'spooky') {
                horrorFilter = 'unspooky';
                btn.textContent = '🎅 Unspooky';
                btn.classList.add('active');
                btn.classList.remove('btn-spooky');
                btn.classList.add('btn-unspooky');
            } else {
                horrorFilter = 'all';
                btn.textContent = '🎃🎅 All Films';
                btn.classList.remove('active');
                btn.classList.remove('btn-spooky', 'btn-unspooky');
            }

            console.log('Horror filter cycled to:', horrorFilter);
            renderFilms();
        }

        function setVoteFilter(filter) {
            if (showArchived) return; // Don't filter in archived mode
            // Toggle off if clicking the same filter
            if (voteFilter === filter) {
                voteFilter = null;
            } else {
                voteFilter = filter;
            }

            // Update button active states
            ['unvotedBtn', 'upvotedBtn', 'neutralBtn', 'downvotedBtn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.classList.remove('active');
            });

            if (voteFilter) {
                const btnId = voteFilter + 'Btn';
                const btn = document.getElementById(btnId);
                if (btn) btn.classList.add('active');
            }

            renderFilms();
        }

        function filterFilms() {
            const input = document.getElementById('filmSearchInput');
            filmSearchQuery = input.value.toLowerCase().trim();
            renderFilms();
        }

        function toggleSortMode() {
            if (showArchived) {
                // In archived mode, toggle between date and rating
                archivedSortMode = archivedSortMode === 'date' ? 'rating' : 'date';
            } else {
                // In regular mode, toggle between score and ratio
                sortMode = sortMode === 'score' ? 'ratio' : 'score';
            }
            updateSortButton();
            renderFilms();
        }

        function updateSortButton() {
            const btn = document.getElementById('sortToggleBtn');
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';

            if (showArchived) {
                btn.textContent = archivedSortMode === 'date' ? '📊 Sort: Date' : '📊 Sort: Rating';
            } else {
                btn.textContent = sortMode === 'score' ? '📊 Sort: Score' : '📊 Sort: Ratio';
            }
        }

        function updateFilterButtons() {
            const filterButtonIds = ['horrorFilterBtn', 'unvotedBtn', 'upvotedBtn', 'neutralBtn', 'downvotedBtn', 'identityBtn'];
            filterButtonIds.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    if (showArchived) {
                        btn.disabled = true;
                        btn.style.opacity = '0.5';
                        btn.style.cursor = 'not-allowed';
                    } else {
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        btn.style.cursor = 'pointer';
                    }
                }
            });
        }

        function toggleIdentityFilter() {
            if (showArchived) return; // Don't filter in archived mode
            const dropdown = document.getElementById('identityDropdown');
            const btn = document.getElementById('identityBtn');
            dropdown.classList.toggle('show');

            // Update button active state based on whether any identities are selected
            if (selectedIdentityIds.length > 0) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }

        function renderIdentityCheckboxes() {
            const container = document.getElementById('identityCheckboxes');
            container.innerHTML = profiles.map(p => `
                <div class="identity-checkbox-item">
                    <input type="checkbox"
                           id="identity-${p.id}"
                           ${selectedIdentityIds.includes(p.id) ? 'checked' : ''}
                           onchange="toggleIdentity(${p.id})">
                    <label for="identity-${p.id}">${p.name}</label>
                </div>
            `).join('');
        }

        function toggleIdentity(profileId) {
            const index = selectedIdentityIds.indexOf(profileId);
            if (index > -1) {
                selectedIdentityIds.splice(index, 1);
            } else {
                selectedIdentityIds.push(profileId);
            }

            // Update button active state
            const btn = document.getElementById('identityBtn');
            if (selectedIdentityIds.length > 0) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }

            loadFilms();
        }

        function selectAllIdentities() {
            selectedIdentityIds = profiles.map(p => p.id);
            renderIdentityCheckboxes();
            document.getElementById('identityBtn').classList.add('active');
            loadFilms();
        }

        function clearAllIdentities() {
            selectedIdentityIds = [];
            renderIdentityCheckboxes();
            document.getElementById('identityBtn').classList.remove('active');
            loadFilms();
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            const dropdown = document.getElementById('identityDropdown');
            const btn = document.getElementById('identityBtn');
            if (dropdown && btn && !dropdown.contains(event.target) && !btn.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });

        // Archive functions
        function toggleArchiveView() {
            showArchived = !showArchived;
            const btn = document.getElementById('archiveToggleBtn');
            if (showArchived) {
                // Reset all active filters before entering archived mode
                resetAllFilters();
                btn.classList.add('active');
                btn.textContent = '🎬 Show Regular';
            } else {
                btn.classList.remove('active');
                btn.textContent = '📦 Show Archived';
            }
            updateSortButton();
            updateFilterButtons();
            loadFilms();
        }

        function resetAllFilters() {
            // Reset horror filter
            if (horrorFilter !== 'all') {
                horrorFilter = 'all';
                const horrorBtn = document.getElementById('horrorFilterBtn');
                if (horrorBtn) {
                    horrorBtn.textContent = '🎃🎅 All Films';
                    horrorBtn.classList.remove('active', 'btn-spooky', 'btn-unspooky');
                }
            }

            // Reset vote filter
            if (voteFilter !== null) {
                voteFilter = null;
                ['unvotedBtn', 'upvotedBtn', 'neutralBtn', 'downvotedBtn'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) btn.classList.remove('active');
                });
            }

            // Reset identity filter
            if (selectedIdentityIds.length > 0) {
                selectedIdentityIds = [];
                const identityBtn = document.getElementById('identityBtn');
                if (identityBtn) identityBtn.classList.remove('active');
                // Close the dropdown if open
                const dropdown = document.getElementById('identityDropdown');
                if (dropdown) dropdown.classList.remove('show');
                // Update checkboxes to uncheck all
                renderIdentityCheckboxes();
            }
        }

        // Archive date modal state
        let archiveModalResolve = null;
        let archiveModalFilmId = null;
        let archiveModalFilmTitle = null;

        function openArchiveModalDatePicker() {
            const hiddenInput = document.getElementById('archiveModalDateHidden');
            hiddenInput.showPicker();
        }

        function syncArchiveModalDate() {
            const hiddenInput = document.getElementById('archiveModalDateHidden');
            const visibleInput = document.getElementById('archiveModalDateDisplay');

            if (hiddenInput.value) {
                visibleInput.value = formatDateToFrench(hiddenInput.value);
            }
        }

        function showArchiveDateModal(filmId, filmTitle) {
            return new Promise((resolve) => {
                archiveModalResolve = resolve;
                archiveModalFilmId = filmId;
                archiveModalFilmTitle = filmTitle;

                // Set default to today's date
                const today = new Date();
                const todayISO = today.toISOString().split('T')[0];
                const todayFormatted = formatDateToFrench(todayISO);

                document.getElementById('modalTitle').textContent = `Archive "${filmTitle}"`;
                document.getElementById('archiveModalDateHidden').value = todayISO;
                document.getElementById('archiveModalDateDisplay').value = todayFormatted;
                document.getElementById('archiveDateModal').classList.add('show');
            });
        }

        function archiveDateModalAction(action) {
            const modal = document.getElementById('archiveDateModal');
            modal.classList.remove('show');

            if (archiveModalResolve) {
                if (action === 'validate') {
                    const selectedDate = document.getElementById('archiveModalDateHidden').value;
                    archiveModalResolve({ action: 'validate', date: selectedDate });
                } else {
                    archiveModalResolve({ action: action });
                }
                archiveModalResolve = null;
            }
        }

        // Add Film Teaser modal state
        let addFilmTeaserModalResolve = null;

        function showAddFilmTeaserModal(filmTitle) {
            return new Promise((resolve) => {
                addFilmTeaserModalResolve = resolve;
                document.getElementById('teaserModalTitle').textContent = `Add "${filmTitle}"`;
                document.getElementById('teaserTextInput').value = '';
                document.getElementById('addFilmTeaserModal').classList.add('show');
            });
        }

        function addFilmTeaserModalAction(action) {
            const modal = document.getElementById('addFilmTeaserModal');
            modal.classList.remove('show');

            if (addFilmTeaserModalResolve) {
                if (action === 'add') {
                    const teaserText = document.getElementById('teaserTextInput').value.trim();
                    addFilmTeaserModalResolve({ action, teaserText });
                } else {
                    addFilmTeaserModalResolve({ action, teaserText: null });
                }
                addFilmTeaserModalResolve = null;
            }
        }

        async function showAddTeaserToFilm(filmId, filmTitle) {
            // Show the modal to get teaser text
            const result = await showAddFilmTeaserModal(filmTitle);

            // If user cancelled, don't update
            if (result.action === 'cancel' || !result.teaserText) {
                return;
            }

            try {
                const res = await fetch('/paradiso/api/films/teaser', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filmId: filmId,
                        teaserText: result.teaserText,
                        profileId: selectedProfile ? selectedProfile.id : null
                    })
                });

                if (res.ok) {
                    await loadFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to add teaser');
                }
            } catch (error) {
                console.error('Failed to add teaser:', error);
                alert('Failed to add teaser. Please try again.');
            }
        }

        async function toggleArchive(filmId, filmTitle) {
            const action = showArchived ? 'unarchive' : 'archive';

            // For unarchiving, just confirm
            if (showArchived) {
                if (!confirm(`Are you sure you want to ${action} "${filmTitle}"?`)) {
                    return;
                }
            } else {
                // For archiving, show the modal to select date
                const result = await showArchiveDateModal(filmId, filmTitle);

                // If user clicked Cancel, don't archive
                if (result.action === 'cancel') {
                    return;
                }

                // Archive the film
                try {
                    const res = await fetch('/paradiso/api/films/archive/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filmId })
                    });

                    if (!res.ok) {
                        const error = await res.json();
                        alert(error.detail || 'Failed to toggle archive status');
                        return;
                    }

                    // Save the selected date
                    if (result.action === 'validate' && result.date) {
                        const metadataRes = await fetch('/paradiso/api/films/archive/metadata', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filmId,
                                archiveDate: result.date,
                                archiveCommentary: null
                            })
                        });

                        if (!metadataRes.ok) {
                            console.error('Failed to save archive date');
                        }
                    }

                    await loadFilms();
                } catch (error) {
                    console.error('Failed to toggle archive:', error);
                    alert('Failed to toggle archive status. Please try again.');
                }
                return;
            }

            // For unarchiving (showArchived === true)
            try {
                const res = await fetch('/paradiso/api/films/archive/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filmId })
                });

                if (res.ok) {
                    await loadFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to toggle archive status');
                }
            } catch (error) {
                console.error('Failed to toggle archive:', error);
                alert('Failed to toggle archive status. Please try again.');
            }
        }

        function formatDateToFrench(isoDateString) {
            if (!isoDateString) return '';
            const date = new Date(isoDateString + 'T00:00:00');
            return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        }

        function openDatePicker(filmId) {
            const hiddenInput = document.getElementById(`archive-date-hidden-${filmId}`);
            hiddenInput.showPicker();
        }

        function syncDateFromPicker(filmId) {
            const hiddenInput = document.getElementById(`archive-date-hidden-${filmId}`);
            const visibleInput = document.getElementById(`archive-date-${filmId}`);

            if (hiddenInput.value) {
                visibleInput.value = formatDateToFrench(hiddenInput.value);
                visibleInput.dataset.isoValue = hiddenInput.value;
            } else {
                visibleInput.value = '';
                visibleInput.dataset.isoValue = '';
            }

            checkArchiveChanges(filmId);
        }

        function checkArchiveChanges(filmId) {
            const visibleInput = document.getElementById(`archive-date-${filmId}`);
            const saveBtn = document.getElementById(`save-archive-${filmId}`);

            if (!visibleInput || !saveBtn) return;

            const originalDate = visibleInput.dataset.originalValue || '';
            const currentIsoValue = visibleInput.dataset.isoValue || '';
            const hasChanges = currentIsoValue !== originalDate;

            if (hasChanges) {
                saveBtn.classList.add('has-changes');
            } else {
                saveBtn.classList.remove('has-changes');
            }
        }

        async function saveArchiveMetadata(filmId) {
            const visibleInput = document.getElementById(`archive-date-${filmId}`);
            const saveBtn = document.getElementById(`save-archive-${filmId}`);

            try {
                const isoDate = visibleInput.dataset.isoValue || null;

                const res = await fetch('/paradiso/api/films/archive/metadata', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filmId,
                        archiveDate: isoDate,
                        archiveCommentary: null
                    })
                });

                if (res.ok) {
                    // Update original value
                    visibleInput.dataset.originalValue = isoDate;
                    saveBtn.classList.remove('has-changes');
                    await loadFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to save archive date');
                }
            } catch (error) {
                console.error('Failed to save archive date:', error);
                alert('Failed to save archive date. Please try again.');
            }
        }

        // Rating functions
        async function loadFilmRatings(filmId) {
            try {
                const res = await fetch(`/paradiso/api/films/${filmId}/ratings`);
                if (res.ok) {
                    const ratings = await res.json();
                    filmRatings[filmId] = ratings;
                }
            } catch (error) {
                console.error('Failed to load ratings:', error);
            }
        }

        async function setRating(filmId, rating) {
            if (!selectedProfile) {
                alert('Please select a profile first');
                return;
            }

            try {
                const res = await fetch(`/paradiso/api/films/${filmId}/rating`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: selectedProfile.id,
                        rating: rating
                    })
                });

                if (res.ok) {
                    await loadFilmRatings(filmId);
                    renderFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to save rating');
                }
            } catch (error) {
                console.error('Failed to save rating:', error);
                alert('Failed to save rating. Please try again.');
            }
        }

        function renderStars(filmId, currentRating) {
            let html = '<div class="star-input">';
            for (let i = 1; i <= 5; i++) {
                const filled = i <= currentRating;
                html += `<span class="star ${filled ? 'filled' : 'empty'}" onclick="setRating(${filmId}, ${i})">★</span>`;
            }
            html += '</div>';
            return html;
        }

        function getUserRating(filmId) {
            if (!selectedProfile || !filmRatings[filmId]) return 0;
            const userRating = filmRatings[filmId].find(r => r.profile_id === selectedProfile.id);
            return userRating ? userRating.rating : 0;
        }

        function getAverageRating(filmId) {
            if (!filmRatings[filmId] || filmRatings[filmId].length === 0) return 0;
            const sum = filmRatings[filmId].reduce((acc, r) => acc + r.rating, 0);
            return (sum / filmRatings[filmId].length).toFixed(1);
        }

        // Comment functions
        async function loadFilmComments(filmId) {
            try {
                const res = await fetch(`/paradiso/api/films/${filmId}/comments`);
                if (res.ok) {
                    const comments = await res.json();
                    filmComments[filmId] = comments;
                }
            } catch (error) {
                console.error('Failed to load comments:', error);
            }
        }

        async function saveComment(filmId) {
            if (!selectedProfile) {
                alert('Please select a profile first');
                return;
            }

            const textarea = document.getElementById(`comment-text-${filmId}`);
            const commentText = textarea.value.trim();

            if (!commentText) {
                alert('Please enter a comment');
                return;
            }

            try {
                const res = await fetch(`/paradiso/api/films/${filmId}/comment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: selectedProfile.id,
                        commentText: commentText
                    })
                });

                if (res.ok) {
                    textarea.value = '';
                    await loadFilmComments(filmId);
                    renderFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to save comment');
                }
            } catch (error) {
                console.error('Failed to save comment:', error);
                alert('Failed to save comment. Please try again.');
            }
        }

        async function deleteComment(filmId) {
            if (!selectedProfile) {
                alert('Please select a profile first');
                return;
            }

            if (!confirm('Are you sure you want to delete your comment?')) {
                return;
            }

            try {
                const res = await fetch(`/paradiso/api/films/${filmId}/comment/${selectedProfile.id}`, {
                    method: 'DELETE'
                });

                if (res.ok) {
                    document.getElementById(`comment-text-${filmId}`).value = '';
                    await loadFilmComments(filmId);
                    renderFilms();
                } else {
                    const error = await res.json();
                    alert(error.detail || 'Failed to delete comment');
                }
            } catch (error) {
                console.error('Failed to delete comment:', error);
                alert('Failed to delete comment. Please try again.');
            }
        }

        function getUserComment(filmId) {
            if (!selectedProfile || !filmComments[filmId]) return null;
            return filmComments[filmId].find(c => c.profile_id === selectedProfile.id);
        }

        function formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' });
        }

        function getProfileNameById(profileId) {
            if (!profileId) return null;
            const profile = profiles.find(p => p.id === profileId);
            return profile ? profile.name : null;
        }

        function showPosterFullscreen(posterUrl, filmTitle) {
            const modal = document.getElementById('posterFullscreenModal');
            const img = document.getElementById('posterFullscreenImage');
            img.src = posterUrl;
            img.alt = filmTitle;
            modal.classList.add('show');
        }

        function closePosterFullscreen() {
            const modal = document.getElementById('posterFullscreenModal');
            modal.classList.remove('show');
        }

        function renderFilms() {
            const container = document.getElementById('filmsList');

            // Apply filters
            let displayFilms = films;

            // Horror filter (3 states: all, spooky, unspooky)
            if (horrorFilter === 'spooky') {
                // Show only horror films
                displayFilms = displayFilms.filter(film => {
                    if (!film.genre) return false;
                    const genre = film.genre.toLowerCase();
                    return genre.includes('horror');
                });
            } else if (horrorFilter === 'unspooky') {
                // Show only non-horror films
                displayFilms = displayFilms.filter(film => {
                    if (!film.genre) return true;
                    const genre = film.genre.toLowerCase();
                    return !genre.includes('horror');
                });
            }
            // If horrorFilter === 'all', don't filter anything

            // Vote filter
            if (voteFilter && selectedProfile) {
                displayFilms = displayFilms.filter(film => {
                    const userVote = userVotes[film.id];
                    if (voteFilter === 'unvoted') {
                        return userVote === undefined;
                    } else if (voteFilter === 'upvoted') {
                        return userVote === 1;
                    } else if (voteFilter === 'neutral') {
                        return userVote === 2;
                    } else if (voteFilter === 'downvoted') {
                        return userVote === -1;
                    }
                    return true;
                });
            }

            // Text search filter
            if (filmSearchQuery) {
                displayFilms = displayFilms.filter(film => {
                    const searchIn = [
                        film.title || '',
                        film.original_title || '',
                        film.director || '',
                        film.actors || '',
                        film.genre || '',
                        film.year || '',
                        film.plot || ''
                    ].join(' ').toLowerCase();
                    return searchIn.includes(filmSearchQuery);
                });
            }

            // Apply sorting
            if (!showArchived) {
                // For regular films, sort by score or ratio
                if (sortMode === 'score') {
                    displayFilms.sort((a, b) => {
                        // Sort by total_score descending, then by ratio descending
                        if (b.total_score !== a.total_score) {
                            return b.total_score - a.total_score;
                        }
                        // Tiebreaker: sort by ratio
                        const totalVotersA = a.upvotes + a.neutral_votes + a.downvotes;
                        const totalVotersB = b.upvotes + b.neutral_votes + b.downvotes;
                        const ratioA = totalVotersA > 0 ? (a.upvotes + a.neutral_votes * 0.5) / totalVotersA : 0;
                        const ratioB = totalVotersB > 0 ? (b.upvotes + b.neutral_votes * 0.5) / totalVotersB : 0;
                        return ratioB - ratioA;
                    });
                } else if (sortMode === 'ratio') {
                    displayFilms.sort((a, b) => {
                        // Calculate ratio as (upvotes + neutral*0.5) / total_voters
                        // Upvote = 1, Neutral = 0.5, Downvote = 0
                        // Handle division by zero: films with no votes get ratio of 0
                        const totalVotersA = a.upvotes + a.neutral_votes + a.downvotes;
                        const totalVotersB = b.upvotes + b.neutral_votes + b.downvotes;
                        const ratioA = totalVotersA > 0 ? (a.upvotes + a.neutral_votes * 0.5) / totalVotersA : 0;
                        const ratioB = totalVotersB > 0 ? (b.upvotes + b.neutral_votes * 0.5) / totalVotersB : 0;

                        // Sort by ratio descending
                        if (ratioB !== ratioA) {
                            return ratioB - ratioA;
                        }
                        // If ratios are equal, sort by total_score
                        return b.total_score - a.total_score;
                    });
                }
            } else {
                // For archived films, sort by date or rating
                if (archivedSortMode === 'date') {
                    // Sort by archive_date descending (most recent first)
                    displayFilms.sort((a, b) => {
                        const dateA = a.archive_date ? new Date(a.archive_date) : new Date(0);
                        const dateB = b.archive_date ? new Date(b.archive_date) : new Date(0);
                        return dateB - dateA;
                    });
                } else {
                    // Sort by star rating (1-5 stars) descending
                    displayFilms.sort((a, b) => {
                        const avgRatingA = getAverageRating(a.id);
                        const avgRatingB = getAverageRating(b.id);

                        // Sort by average star rating descending
                        if (avgRatingB !== avgRatingA) {
                            return avgRatingB - avgRatingA;
                        }

                        // If star ratings are equal, sort by number of ratings (more ratings = higher priority)
                        const numRatingsA = filmRatings[a.id] ? filmRatings[a.id].length : 0;
                        const numRatingsB = filmRatings[b.id] ? filmRatings[b.id].length : 0;
                        if (numRatingsB !== numRatingsA) {
                            return numRatingsB - numRatingsA;
                        }

                        // If still equal, sort by archive date
                        const dateA = a.archive_date ? new Date(a.archive_date) : new Date(0);
                        const dateB = b.archive_date ? new Date(b.archive_date) : new Date(0);
                        return dateB - dateA;
                    });
                }
            }

            if (displayFilms.length === 0) {
                let message = 'No films yet. Add one above!';
                if (filmSearchQuery) message = `No films found matching "${filmSearchQuery}"`;
                if (horrorFilter === 'spooky') message = 'No spooky films found!';
                if (horrorFilter === 'unspooky') message = 'No unspooky films found!';
                if (voteFilter) message = `No ${voteFilter} films found!`;
                container.innerHTML = `<p>${message}</p>`;
                return;
            }

            container.innerHTML = displayFilms.map(film => `
                <div class="film-item">
                    <button class="film-archive" onclick="toggleArchive(${film.id}, '${film.title.replace(/'/g, "\\'")}')">📦</button>
                    <button class="film-delete" onclick="deleteFilm(${film.id}, '${film.title.replace(/'/g, "\\'")}')">×</button>
                    ${film.poster_url ? `<img class="film-poster" src="${film.poster_url}" alt="${film.title}" onerror="handleImageError(this)" onclick="showPosterFullscreen('${film.poster_url}', '${film.title.replace(/'/g, "\\'")}')">` : '<div class="poster-placeholder">🎬</div>'}
                    <div class="film-details">
                        <div class="film-title">${film.title}</div>
                        ${film.original_title ? `<div class="film-original-title">${film.original_title}</div>` : ''}
                        <div class="film-year">${film.year}</div>

                        ${showArchived ? `
                            <div class="archive-metadata">
                                <div class="archive-metadata-row">
                                    <span class="archive-metadata-label">📅 Date:</span>
                                    <input type="text"
                                           id="archive-date-${film.id}"
                                           value="${film.archive_date ? formatDateToFrench(film.archive_date) : ''}"
                                           data-iso-value="${film.archive_date || ''}"
                                           data-original-value="${film.archive_date || ''}"
                                           readonly
                                           onclick="openDatePicker(${film.id})"
                                           placeholder="Cliquez pour sélectionner"
                                           style="cursor: pointer;">
                                    <input type="date"
                                           id="archive-date-hidden-${film.id}"
                                           value="${film.archive_date || ''}"
                                           onchange="syncDateFromPicker(${film.id})"
                                           style="position: absolute; opacity: 0; pointer-events: none;">
                                    <button id="save-archive-${film.id}"
                                            class="btn-save-archive"
                                            onclick="saveArchiveMetadata(${film.id})">
                                        💾 Save
                                    </button>
                                </div>
                            </div>

                            ${selectedProfile ? `
                                <!-- Ratings Section -->
                                <div class="ratings-section">
                                    <div class="ratings-header">⭐ Star Rating</div>
                                    <div class="your-rating">
                                        <span class="your-rating-label">Your Rating:</span>
                                        ${renderStars(film.id, getUserRating(film.id))}
                                    </div>
                                    <div class="all-ratings">
                                        ${filmRatings[film.id] && filmRatings[film.id].length > 0 ? `
                                            ${filmRatings[film.id].map(rating => `
                                                <div class="rating-item">
                                                    <span class="rating-identity">${rating.profile_name}:</span>
                                                    <span class="rating-stars">${'★'.repeat(rating.rating)}${'☆'.repeat(5 - rating.rating)}</span>
                                                </div>
                                            `).join('')}
                                            <div class="average-rating">Average: ${getAverageRating(film.id)} / 5.0</div>
                                        ` : '<div style="color: var(--text-secondary); font-size: 12px;">No ratings yet</div>'}
                                    </div>
                                </div>

                                <!-- Comments Section -->
                                <div class="comments-section">
                                    <div class="comments-header">💬 Comments</div>
                                    <div class="your-comment">
                                        <div class="your-comment-label">Your Comment:</div>
                                        <div class="comment-input-wrapper">
                                            <textarea
                                                id="comment-text-${film.id}"
                                                class="comment-textarea"
                                                placeholder="Share your thoughts about this film...">${getUserComment(film.id)?.comment_text || ''}</textarea>
                                            <div class="comment-buttons">
                                                <button class="btn-save-comment" onclick="saveComment(${film.id})">
                                                    💾 Save Comment
                                                </button>
                                                ${getUserComment(film.id) ? `
                                                    <button class="btn-delete-comment" onclick="deleteComment(${film.id})">
                                                        🗑️ Delete
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="all-comments">
                                        ${filmComments[film.id] && filmComments[film.id].length > 0 ? `
                                            ${filmComments[film.id].filter(c => c.profile_id !== selectedProfile.id).map(comment => `
                                                <div class="comment-item">
                                                    <div class="comment-header">
                                                        <span class="comment-identity">${comment.profile_name}</span>
                                                        <span class="comment-date">${formatDate(comment.created_at)}</span>
                                                    </div>
                                                    <div class="comment-text">${comment.comment_text}</div>
                                                </div>
                                            `).join('')}
                                        ` : '<div style="color: var(--text-secondary); font-size: 12px;">No other comments yet</div>'}
                                    </div>
                                </div>
                            ` : ''}
                        ` : `
                            <div class="vote-buttons">
                                <button class="vote-btn vote-btn-up ${userVotes[film.id] === 1 ? 'active' : ''}"
                                        onclick="vote(${film.id}, 1)"
                                        onmouseenter="showVoterTooltip(event, ${film.id})"
                                        onmouseleave="hideVoterTooltip()">
                                    👍 Upvote (${film.upvotes})
                                </button>
                                <button class="vote-btn vote-btn-neutral ${userVotes[film.id] === 2 ? 'active' : ''}"
                                        onclick="vote(${film.id}, 2)"
                                        onmouseenter="showVoterTooltip(event, ${film.id})"
                                        onmouseleave="hideVoterTooltip()">
                                    ➖ Neutral (${film.neutral_votes || 0})
                                </button>
                                <button class="vote-btn vote-btn-down ${userVotes[film.id] === -1 ? 'active' : ''}"
                                        onclick="vote(${film.id}, -1)"
                                        onmouseenter="showVoterTooltip(event, ${film.id})"
                                        onmouseleave="hideVoterTooltip()">
                                    👎 Downvote (${film.downvotes})
                                </button>
                                <div class="vote-score">
                                    Score: ${film.total_score > 0 ? '+' : ''}${film.total_score}
                                    ${(() => {
                                        const totalVoters = film.upvotes + film.neutral_votes + film.downvotes;
                                        if (totalVoters === 0) return '';
                                        const ratio = (film.upvotes + film.neutral_votes * 0.5) / totalVoters;
                                        return ` | Ratio: ${(ratio * 100).toFixed(0)}%`;
                                    })()}
                                </div>
                                <span class="viewed-icon ${userViewed.includes(film.id) ? 'viewed' : 'not-viewed'}"
                                      onclick="toggleViewed(${film.id})"
                                      onmouseenter="showViewerTooltip(event, ${film.id})"
                                      onmouseleave="hideVoterTooltip()"
                                      title="${userViewed.includes(film.id) ? 'Mark as not viewed' : 'Mark as viewed'}">
                                    👁️
                                </span>
                            </div>
                        `}

                        <button class="info-btn" onclick="toggleInfo(${film.id})">
                            ℹ️ Info
                        </button>

                        ${film.teaser_text ? `
                            <button class="plot-btn" onclick="togglePlot(${film.id})" style="background: #9C27B0;">
                                🎭 Teaser
                            </button>
                        ` : `
                            <button class="plot-btn" onclick="togglePlot(${film.id})">
                                📖 Plot (Spoilers)
                            </button>
                            <button class="trailer-btn" onclick="toggleTrailer(${film.id})">
                                🎬 Trailer
                            </button>
                            <button class="plot-btn" onclick="showAddTeaserToFilm(${film.id}, '${film.title.replace(/'/g, "\\'")}')" style="background: #9C27B0;">
                                ➕ Add Teaser
                            </button>
                        `}

                        <div id="info-${film.id}" class="info-content">
                            <p><strong>Genre:</strong> ${film.genre}</p>
                            <p><strong>Director:</strong> ${film.director}</p>
                            <p><strong>Actors:</strong> ${film.actors}</p>
                        </div>

                        ${film.teaser_text ? `
                            <div id="plot-${film.id}" class="plot-content">
                                <button class="teaser-delete" onclick="deleteTeaser(${film.id}, '${film.title.replace(/'/g, "\\'")}')">×</button>
                                <p style="font-style: italic; line-height: 1.6;">${film.teaser_text}</p>
                                <p style="margin-top: 12px; font-size: 0.9em; color: var(--text-secondary);">
                                    <strong>— ${getProfileNameById(film.submitted_by_profile_id) || '???'}</strong>
                                </p>
                            </div>
                        ` : `
                            <div id="plot-${film.id}" class="plot-content">
                                <p><strong>Plot:</strong> ${film.plot}</p>
                            </div>
                            <a id="trailer-${film.id}" class="trailer-link" href="${film.trailer_url}" target="_blank">
                                Watch Trailer on YouTube →
                            </a>
                        `}
                    </div>
                </div>
            `).join('');
        }

        // Initialize on page load
        init();
