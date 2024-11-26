// app.js
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { 
    getDatabase,
    ref, 
    set, 
    push,
    get,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updateProfile,
    updateEmail,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-storage.js";

// Initialize Firebase
console.log('Initializing Firebase...');
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Global State
let selectedDates = [];
let selectedLocations = [];
let currentEditingTribeId = null;
let currentUser = null;
let editingEventId = null;
let lastSelectedDate = null;
let editingLocationIndex = null;

// Utility Functions
function getUserRef() {
    if (!currentUser) {
        console.error('No user logged in');
        throw new Error('No user logged in');
    }
    return `users/${currentUser.uid}`;
}

function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        timeZone: 'UTC'
    });
}

function sortPeopleArray(people) {
    return Object.entries(people)
        .sort((a, b) => {
            const nameA = `${a[1].firstName} ${a[1].lastName}`.toLowerCase();
            const nameB = `${b[1].firstName} ${b[1].lastName}`.toLowerCase();
            return nameA.localeCompare(nameB);
        });
}

function getVoteUrl(eventId) {
    if (!currentUser) return '';
    return `${window.location.origin}/event.html?event=${eventId}&user=${currentUser.uid}`;
}

function showShareLink(eventId) {
    const shareLink = document.getElementById('shareLink');
    const shareLinkInput = document.getElementById('shareLinkInput');
    const eventUrl = `${window.location.origin}/event.html?event=${eventId}&user=${currentUser.uid}`;
    
    shareLinkInput.value = eventUrl;
    shareLink.style.display = 'block';
}

// Authentication Functions
async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error logging in with Google:", error);
        alert("Error logging in with Google");
    }
}

async function loginWithEmail() {
    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Error logging in with email:", error);
        alert("Error logging in with email");
    }
}

async function signupWithEmail() {
    const name = document.getElementById('signupNameInput').value;
    const email = document.getElementById('signupEmailInput').value;
    const password = document.getElementById('signupPasswordInput').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, {
            displayName: name
        });
    } catch (error) {
        console.error("Error signing up with email:", error);
        alert("Error signing up with email");
    }
}

async function logout() {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Error logging out:", error);
        alert("Error logging out");
    }
}

// Profile Management
async function updateProfileInfo(e) {
    e.preventDefault();
    const newFirstName = document.getElementById('profileFirstName').value;
    const newLastName = document.getElementById('profileLastName').value;
    const newEmail = document.getElementById('profileEmail').value;
    
    if (!currentUser) return;
    
    try {
        const updates = [];
        
        // Update display name if changed
        if (newFirstName !== currentUser.displayName.split(' ')[0] || newLastName !== currentUser.displayName.split(' ')[1]) {
            updates.push(updateProfile(currentUser, { displayName: `${newFirstName} ${newLastName}` }));
        }
        
        // Update email if changed
        if (newEmail !== currentUser.email) {
            updates.push(updateEmail(currentUser, newEmail));
        }
        
        await Promise.all(updates);
        
        // Update database profile
        const userRef = ref(database, `users/${currentUser.uid}/profile`);
        await set(userRef, {
            firstName: newFirstName,
            lastName: newLastName,
            email: newEmail,
            subscription: 'free', // Assuming subscription is not changing here
            updatedAt: new Date().toISOString()
        });
        
        // Update UI
        document.getElementById('userName').textContent = `${newFirstName} ${newLastName}`;
        alert('Profile updated successfully');
    } catch (error) {
        console.error("Error updating profile:", error);
        if (error.code === 'auth/requires-recent-login') {
            alert("For security reasons, please log out and log back in before changing your email.");
        } else {
            alert("Error updating profile: " + error.message);
        }
    }
}

async function deleteAccount() {
    if (!currentUser) return;
    
    const confirmDelete = confirm(
        'Are you absolutely sure you want to delete your account? This action cannot be undone.'
    );
    
    if (!confirmDelete) return;

    try {
        // First, delete all user data from the database
        const userRef = ref(database, `users/${currentUser.uid}`);
        await remove(userRef);

        // Then delete the user account
        await deleteUser(currentUser);
        
        // Redirect to login page
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error deleting account:', error);
        
        if (error.code === 'auth/requires-recent-login') {
            // Handle re-authentication
            const password = prompt('For security, please enter your password to confirm account deletion:');
            if (password) {
                try {
                    const credential = EmailAuthProvider.credential(currentUser.email, password);
                    await reauthenticateWithCredential(currentUser, credential);
                    // Retry deletion after re-authentication
                    await deleteAccount();
                } catch (reAuthError) {
                    alert('Invalid password. Account deletion canceled.');
                }
            }
        } else {
            alert('Error deleting account: ' + error.message);
        }
    }
}

// Navigation Functions
function showEventsList() {
    const eventsList = document.getElementById('eventsList');
    const eventDetailView = document.getElementById('eventDetailView');
    
    if (eventsList) {
        eventsList.style.display = 'block';
    }
    if (eventDetailView) {
        eventDetailView.style.display = 'none';
    }
    
    // After successful update, switch to events view
    switchTab('events');
}

// Mobile Menu Toggle
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const isMobile = window.innerWidth <= 1024;
    
    if (isMobile) {
        sidebar.classList.toggle('active');
    }
}

// Event Management Functions
async function createEvent(e) {
    e.preventDefault();
    if (!currentUser) {
        alert('Please login first');
        return;
    }
    
    const tribeId = document.getElementById('tribeSelect').value;
    if (!tribeId) {
        alert('Please select a tribe for this event');
        return;
    }

    const eventData = {
        title: document.getElementById('eventTitle').value,
        description: document.getElementById('eventDescription').value,
        type: document.querySelector('input[name="eventType"]:checked').value,
        anonymous: document.getElementById('anonymousResponses').checked,
        dates: selectedDates.map(dateRange => {
            if (dateRange.type === 'dayOfWeek') {
                return {
                    type: 'dayOfWeek',
                    days: dateRange.days,
                    displayRange: `Days: ${dateRange.days.join(', ')}`
                };
            }
            return {
                start: dateRange.start,
                end: dateRange.end,
                displayRange: `${formatDateForDisplay(dateRange.start)} to ${formatDateForDisplay(dateRange.end)}`
            };
        }),
        locations: selectedLocations,
        userId: currentUser.uid,
        created: new Date().toISOString(),
        tribeId: tribeId
    };

    try {
        let eventRef;
        if (editingEventId) {
            // Update existing event
            eventRef = ref(database, `${getUserRef()}/events/${editingEventId}`);
            // Preserve creation data and votes
            const existingEvent = (await get(eventRef)).val();
            eventData.created = existingEvent.created;
            eventData.participants = existingEvent.participants || {};
            
            // Resize participant vote arrays
            const newDatesLength = eventData.dates.length;
            Object.keys(eventData.participants).forEach(participantId => {
                const currentVotes = eventData.participants[participantId].votes || [];
                while (currentVotes.length < newDatesLength) {
                    currentVotes.push(1);
                }
                eventData.participants[participantId].votes = currentVotes.slice(0, newDatesLength);
            });
            
            await set(eventRef, eventData);
            // Switch to events list view after update
            switchTab('events');
            showEventsList();
            editingEventId = null; // Reset editing state
        } else {
            // Create new event
            eventRef = push(ref(database, `${getUserRef()}/events`));
            await set(eventRef, {
                ...eventData,
                participants: {}
            });
            showShareLink(eventRef.key);
        }
        
        // Reset form and state
        resetEventForm();
        
    } catch (error) {
        console.error("Error managing event: ", error);
        alert("Error managing event. Please try again.");
    }
}

function resetEventForm() {
    document.getElementById('eventForm').reset();
    selectedDates = [];
    selectedLocations = [];
    renderDates();
    renderLocations();
}

// Location Management Functions
function resetLocationForm() {
    document.getElementById('locationName').value = '';
    document.getElementById('locationDescription').value = '';
    document.getElementById('locationImage').value = '';
    editingLocationIndex = null;
    
    // Find the button using querySelector and only update if found
    const addLocationBtn = document.querySelector('button[onclick="addLocation()"]');
    if (addLocationBtn) {
        addLocationBtn.textContent = 'Add Location';
    }
}

async function addLocation() {
    if (editingLocationIndex !== null) {
        return updateLocation();
    }

    const name = document.getElementById('locationName').value.trim();
    const description = document.getElementById('locationDescription').value.trim();
    const imageFile = document.getElementById('locationImage').files[0];

    if (!name) {
        alert('Please enter a location name');
        return;
    }

    let imageUrl = '';
    if (imageFile) {
        const storagePath = `locations/${currentUser.uid}/${Date.now()}_${imageFile.name}`;
        const imageRef = storageRef(storage, storagePath);
        await uploadBytes(imageRef, imageFile);
        imageUrl = await getDownloadURL(imageRef);
    }

    const location = {
        name,
        description,
        imageUrl,
        votes: { yes: 0, no: 0 }
    };

    selectedLocations.push(location);
    renderLocations();

    // Write location to database
    if (editingEventId) {
        const eventRef = ref(database, `${getUserRef()}/events/${editingEventId}/locations`);
        await set(eventRef, selectedLocations);
    }

    resetLocationForm();
}
function editLocation(index, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const location = selectedLocations[index];
    document.getElementById('locationName').value = location.name;
    document.getElementById('locationDescription').value = location.description;
    editingLocationIndex = index;

    // Update the button text and onclick handler
    const addLocationBtn = document.getElementById('addLocationBtn');
    addLocationBtn.textContent = 'Update Location';
    addLocationBtn.setAttribute('onclick', 'updateLocation()');
}
async function updateLocation() {
    const name = document.getElementById('locationName').value.trim();
    const description = document.getElementById('locationDescription').value.trim();
    const imageFile = document.getElementById('locationImage').files[0];

    if (!name) {
        alert('Location name is required');
        return;
    }

    let imageUrl = selectedLocations[editingLocationIndex].imageUrl; // Keep existing image if no new one
    if (imageFile) {
        // Upload new image and get URL
        const storageRef = ref(storage, `locations/${currentUser.uid}/${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
    }

    selectedLocations[editingLocationIndex] = {
        ...selectedLocations[editingLocationIndex],
        name,
        description,
        imageUrl
    };

    // Update database if editing an event
    if (editingEventId) {
        const eventRef = ref(database, `${getUserRef()}/events/${editingEventId}/locations`);
        await set(eventRef, selectedLocations);
    }

    resetLocationForm();
    renderLocations();
}
async function deleteLocation(index) {
    if (confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
        selectedLocations.splice(index, 1);
        renderLocations();

        // Update database if editing an event
        if (editingEventId) {
            const eventRef = ref(database, `${getUserRef()}/events/${editingEventId}/locations`);
            await set(eventRef, selectedLocations);
        }
    }
}

function renderLocations() {
    const locationList = document.getElementById('locationList');
    locationList.innerHTML = selectedLocations.map((location, index) => `
        <div class="location-row">
            <span class="location-name">${location.name}</span>
            <div class="location-actions">
                               <button class="action-button edit" onclick="editLocation(${index}, event)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                </button>
                <button class="action-button delete" onclick="deleteLocation(${index})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}


// Date Management Functions
function addDate() {
    const specificDateInput = document.getElementById('specificDateInput');
    const startDateInput = document.getElementById('startDateInput');
    const endDateInput = document.getElementById('endDateInput');
    const eventType = document.querySelector('input[name="eventType"]:checked').value;

    if (eventType === 'specific' && specificDateInput.value) {
        selectedDates.push({ start: specificDateInput.value, end: specificDateInput.value });
        specificDateInput.value = '';
    } else if (eventType === 'range' && startDateInput.value && endDateInput.value) {
        selectedDates.push({ start: startDateInput.value, end: endDateInput.value });
        startDateInput.value = '';
        endDateInput.value = '';
    }

    renderDates();
}

function addDaysOfWeek() {
    const daysOfWeek = Array.from(document.querySelectorAll('input[name="daysOfWeek"]:checked')).map(cb => cb.value);
    if (daysOfWeek.length > 0) {
        selectedDates.push({ type: 'dayOfWeek', days: daysOfWeek });
        document.querySelectorAll('input[name="daysOfWeek"]').forEach(cb => cb.checked = false);
    }
    renderDates();
}

function renderDates() {
    const datesList = document.getElementById('datesList');
    datesList.innerHTML = selectedDates.map((date, index) => `
        <div class="date-tag">
            ${date.type === 'dayOfWeek' ? `Days: ${date.days.join(', ')}` : `${formatDateForDisplay(date.start)} to ${formatDateForDisplay(date.end)}`}
            <button onclick="removeDate('${date.start}', '${date.end}')">x</button>
        </div>
    `).join('');
}

// Event Listing and Detail Functions
function loadEvents() {
    if (!currentUser) return;
    
    const eventsRef = ref(database, `${getUserRef()}/events`);
    const tribesRef = ref(database, `${getUserRef()}/tribes`);
    
    onValue(eventsRef, async (snapshot) => {
        const events = snapshot.val() || {};
        const tribesSnap = await get(tribesRef);
        const tribes = tribesSnap.val() || {};
        
        // Enhance events with tribe info
        const enhancedEvents = Object.entries(events).map(([eventId, eventData]) => {
            return [eventId, {
                ...eventData,
                tribeInfo: tribes[eventData.tribeId] || { name: 'Unknown Group' }
            }];
        });
        
        renderEventsList(enhancedEvents);
    });
}

function renderEventsList(events) {
    const eventsList = document.getElementById('eventsList');
    eventsList.innerHTML = events.map(([eventId, event]) => {
        const memberCount = event.tribeInfo.members?.length || 0;
        return `
            <div class="event-row" onclick="showEventDetail('${eventId}')">
                <div class="event-info">
                    <div class="event-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                    </div>
                    <div class="event-name">${event.title}</div>
                </div>
                <div class="group-info">
                    <svg class="group-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    ${event.tribeInfo.name} <span class="member-count">(${memberCount})</span>
                </div>
                <div class="event-actions" onclick="event.stopPropagation()">
                    <button class="action-button edit" onclick="editEventDates('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                    </button>
                    <button class="action-button delete" onclick="deleteEvent('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                    <button class="action-button share" onclick="copyEventLink('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 12v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>
                            <path d="M16 12v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-2"/>
                            <line x1="8" y1="12" x2="16" y2="12"/>
                        </svg>
                    </button>
                    <button class="action-button go" onclick="openEventLink('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 5v14"/>
                            <path d="M5 12h14"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function showEventDetail(eventId) {
    if (!currentUser || !eventId) return;

    try {
        // Show loading state
        const eventsList = document.getElementById('eventsList');
        if (!eventsList) throw new Error('Events list element not found');
        eventsList.style.display = 'none';

        // Ensure detail view exists
        let detailView = document.getElementById('eventDetailView');
        if (!detailView) {
            detailView = document.createElement('div');
            detailView.id = 'eventDetailView';
            eventsList.parentNode.appendChild(detailView);
        }
        detailView.style.display = 'block';
        detailView.innerHTML = '<div class="content-card">Loading...</div>';

        // Fetch event data
        const eventRef = ref(database, `${getUserRef()}/events/${eventId}`);
        const eventSnap = await get(eventRef);
        const eventData = eventSnap.val();

        if (!eventData) {
            throw new Error('Event not found');
        }

        // Fetch tribe data
        const tribesRef = ref(database, `${getUserRef()}/tribes`);
        const tribesSnap = await get(tribesRef);
        const tribes = tribesSnap.val() || {};
        
        // Combine event data with tribe info
        eventData.tribeInfo = tribes[eventData.tribeId] || { name: 'Unknown Group' };

        // Render event detail sections
        detailView.innerHTML = `
            <div class="content-card">
                <div id="eventDetail">
                    <button onclick="showEventsList()" class="back-to-list">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                        Back to Events List
                    </button>
                </div>
            </div>
        `;

        // Render the event details
        renderEventDetail(eventId, eventData);

    } catch (error) {
        console.error('Error loading event details:', error);
        const detailView = document.getElementById('eventDetailView');
        if (detailView) {
            detailView.innerHTML = `
                <div class="content-card">
                    <button onclick="showEventsList()" class="back-to-list">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                        Back to Events List
                    </button>
                    <div class="error-message">
                        Error loading event details. Please try again.
                    </div>
                </div>
            `;
        }
    }
}

function renderEventDetail(eventId, eventData) {
    const detailContent = document.getElementById('eventDetail');
    detailContent.innerHTML = `
        <button onclick="showEventsList()" class="back-to-list">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back to Events List
        </button>

        <div class="detail-header">
            <div class="event-title-section">
                <h2>${eventData.title}</h2>
                <div class="event-meta">
                    <div class="meta-item">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        ${eventData.tribeInfo.name}
                    </div>
                    <div class="meta-item">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        Created ${new Date(eventData.created).toLocaleDateString()}
                    </div>
                    <div class="event-actions">
                        <button class="action-button edit" onclick="editEventDates('${eventId}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                            </svg>
                        </button>
                        <button class="action-button delete" onclick="deleteEvent('${eventId}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                        <button class="action-button share" onclick="copyEventLink('${eventId}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 12v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>
                                <path d="M16 12v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-2"/>
                                <line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                        </button>
                        <button class="action-button go" onclick="openEventLink('${eventId}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 5v14"/>
                                <path d="M5 12h14"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="detail-content">
            <div class="section-card">
                <h3 class="section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Availability Summary
                </h3>
                <div class="votes-summary">
                    ${renderVotesSummary(eventData)}
                </div>
            </div>

            <div class="section-card">
                <h3 class="section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Individual Responses
                </h3>
                ${renderIndividualResponses(eventData)}
            </div>
            <div class="section-card">
                <h3 class="section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
                    </svg>
                    Location Summary
                </h3>
                <div class="votes-summary">
                    ${renderLocationVotesSummary(eventData)}
                </div>
            </div>

            <div class="section-card">
                <h3 class="section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Individual Responses
                </h3>
                ${renderLocationIndividualResponses(eventData)}
            </div>
        </div>
    `;
}

function renderVotesSummary(eventData) {
    const participants = eventData.participants || {};
    const yesVotesPerDate = eventData.dates.map((_, index) => 
        Object.values(participants).filter(p => p.dateVotes[index] === 2).length
    );
    const maxYesVotes = Math.max(...yesVotesPerDate);

    return eventData.dates.map((date, index) => {
        const yesVotes = yesVotesPerDate[index];
        const noVotes = Object.values(participants).filter(p => p.dateVotes[index] === 0).length;
        const isMaxVotes = yesVotes === maxYesVotes && maxYesVotes > 0;

        let displayText;
        if (date.start === date.end) {
            displayText = formatDateForDisplay(date.start);
        } else {
            displayText = `${formatDateForDisplay(date.start)} to ${formatDateForDisplay(date.end)}`;
        }

        return `
            <div class="vote-card ${isMaxVotes ? 'best-date' : ''}">
                <div class="vote-date">${displayText}</div>
                <div class="vote-stats">
                    <div class="stat-item yes-votes">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        ${yesVotes}
                    </div>
                    <div class="stat-item no-votes">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        ${noVotes}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderLocationVotesSummary(eventData) {
    const participants = eventData.participants || {};
    const locationVotes = eventData.locations.map((location, index) => {
        const yesVotes = Object.values(participants).filter(p => p.locationVotes[index] === 2).length;
        const noVotes = Object.values(participants).filter(p => p.locationVotes[index] === 0).length;
        return {
            ...location,
            yesVotes,
            noVotes
        };
    });

    const maxYesVotes = Math.max(...locationVotes.map(l => l.yesVotes));

    return locationVotes.map(location => `
        <div class="vote-card ${location.yesVotes === maxYesVotes && maxYesVotes > 0 ? 'best-location' : ''}">
            <div class="vote-location">${location.name}</div>
            <div class="vote-stats">
                <div class="stat-item yes-votes">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    ${location.yesVotes}
                </div>
                <div class="stat-item no-votes">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    ${location.noVotes}
                </div>
            </div>
        </div>
    `).join('');
}
function renderIndividualResponses(eventData) {
    const participants = eventData.participants || {};
    
    return `
        <div class="votes-table-container">
            <table class="votes-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        ${eventData.dates.map(date => {
                            if (date.start === date.end) {
                                return `<th>${formatDateForDisplay(date.start)}</th>`;
                            } else {
                                return `<th>${date.displayRange}</th>`;
                            }
                        }).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(participants).map(([name, data]) => `
                        <tr>
                            <td>${eventData.anonymous ? '(Anonymous)' : name}</td>
                            ${data.dateVotes.map(vote => `
                                <td class="votes-indicator-cell">
                                    <div class="vote-indicator ${
                                        vote === 2 ? 'vote-yes' : 
                                        vote === 0 ? 'vote-no' : 
                                        'vote-pending'
                                    }">
                                        ${vote === 2 ? '✓' : vote === 0 ? '✗' : '?'}
                                    </div>
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderLocationIndividualResponses(eventData) {
    const participants = eventData.participants || {};
    
    return `
        <div class="votes-table-container">
            <table class="votes-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        ${eventData.locations.map(location => `<th>${location.name}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(participants).map(([name, data]) => `
                        <tr>
                            <td>${eventData.anonymous ? '(Anonymous)' : name}</td>
                            ${data.locationVotes.map(vote => `
                                <td class="votes-indicator-cell">
                                    <div class="vote-indicator ${
                                        vote === 2 ? 'vote-yes' : 
                                        vote === 0 ? 'vote-no' : 
                                        'vote-pending'
                                    }">
                                        ${vote === 2 ? '✓' : vote === 0 ? '✗' : '?'}
                                    </div>
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Event Action Functions
window.copyEventLink = async function(eventId) {
    try {
        const eventUrl = getVoteUrl(eventId);
        if (!eventUrl) {
            throw new Error('Could not find link to copy');
        }
        await navigator.clipboard.writeText(eventUrl);
        alert('Link copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy link. Please copy it manually.');
    }
};

window.openEventLink = function(eventId) {
    try {
        const eventUrl = getVoteUrl(eventId);
        if (!eventUrl) {
            throw new Error('Could not find URL to open');
        }
        window.open(eventUrl, '_blank');
    } catch (err) {
        console.error('Failed to open link:', err);
        alert('Failed to open link');
    }
};
// Event Management Functions
window.toggleAnonymous = async function(eventId, isAnonymous) {
    if (!currentUser) return;
    
    try {
        const eventRef = ref(database, `${getUserRef()}/events/${eventId}`);
        await set(eventRef, {
            ...(await get(eventRef)).val(),
            anonymous: isAnonymous
        });
    } catch (error) {
        console.error("Error updating anonymous setting:", error);
        alert("Error updating anonymous setting");
    }
};

window.editEventDates = async function(eventId) {
    if (!currentUser) return;
    
    try {
        const eventRef = ref(database, `${getUserRef()}/events/${eventId}`);
        const eventSnap = await get(eventRef);
        const eventData = eventSnap.val();
        
        if (!eventData) {
            throw new Error('Event not found');
        }

        // Switch to create event view and update header
        switchTab('createEvent');
        document.querySelector('.content-header h1').textContent = 'Edit Event';
        
        // Populate form with existing data
        document.getElementById('eventTitle').value = eventData.title;
        document.getElementById('eventDescription').value = eventData.description || '';
        document.getElementById('tribeSelect').value = eventData.tribeId;
        
        // Set event type
        const eventTypeRadio = document.querySelector(`input[name="eventType"][value="${eventData.type}"]`);
        if (eventTypeRadio) {
            eventTypeRadio.checked = true;
            handleEventTypeChange();
        }
        
        // Load existing dates
        selectedDates = eventData.dates.map(date => {
            if (date.type === 'dayOfWeek') {
                return {
                    type: 'dayOfWeek',
                    days: date.days
                };
            }
            return {
                start: date.start,
                end: date.end
            };
        });
        
        renderDates();
        
        // Load existing locations
        selectedLocations = eventData.locations || [];
        renderLocations();
        
        editingEventId = eventId;
        
        // Update form submit button text
        const submitBtn = document.querySelector('#eventForm button[type="submit"]');
        submitBtn.textContent = 'Update Event';
        
        // Show cancel button if not already present
        if (!document.querySelector('.cancel-edit-btn')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'cancel-edit-btn secondary-button';
            cancelBtn.textContent = 'Cancel Edit';
            cancelBtn.onclick = cancelEventEdit;
            submitBtn.parentNode.insertBefore(cancelBtn, submitBtn);
        }

        document.getElementById('anonymousResponses').checked = eventData.anonymous || false;

        // Hide event detail view
        document.getElementById('eventDetailView').style.display = 'none';
    } catch (error) {
        console.error('Error loading event for editing:', error);
        alert('Error loading event for editing');
    }
};

window.cancelEventEdit = function() {
    editingEventId = null;
    document.querySelector('#eventForm button[type="submit"]').textContent = 'Create Event';
    document.querySelector('.content-header h1').textContent = 'Create New Event';
    const cancelBtn = document.querySelector('.cancel-edit-btn');
    if (cancelBtn) cancelBtn.remove();
    resetEventForm();
    // Navigate back to events list
    switchTab('events');
    showEventsList();
};

window.deleteEvent = async function(eventId) {
    if (!currentUser) return;
    
    if (confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
        try {
            const eventRef = ref(database, `${getUserRef()}/events/${eventId}`);
            await remove(eventRef);
            showEventsList();
            alert('Event deleted successfully');
        } catch (error) {
            console.error("Error deleting event:", error);
            alert("Error deleting event. Please try again.");
        }
    }
};

// Navigation Functions
function switchTab(tabName) {
    // Remove active class from all buttons and content
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Add active class to selected button and content
    const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
    const selectedContent = document.getElementById(`${tabName}View`);
    
    if (selectedButton && selectedContent) {
        selectedButton.classList.add('active');
        selectedContent.classList.add('active');
        
        // Close mobile menu if window width is mobile size
        if (window.innerWidth <= 1024) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.classList.remove('active');
            }
        }
    }
}

function handleEventTypeChange() {
    const eventType = document.querySelector('input[name="eventType"]:checked')?.value;
    const specificDateSection = document.getElementById('specificDateSection');
    const rangeDateSection = document.getElementById('rangeDateSection');
    const dayOfWeekSection = document.getElementById('dayOfWeekSection');

    // Hide all sections first
    specificDateSection.style.display = 'none';
    rangeDateSection.style.display = 'none';
    dayOfWeekSection.style.display = 'none';

    // Show the appropriate section based on event type
    switch(eventType) {
        case 'specific':
            specificDateSection.style.display = 'block';
            break;
        case 'range':
            rangeDateSection.style.display = 'block';
            break;
        case 'dayOfWeek':
            dayOfWeekSection.style.display = 'block';
            break;
    }
}

// Make sure event listeners are set up
document.querySelectorAll('input[name="eventType"]').forEach(radio => {
    radio.addEventListener('change', handleEventTypeChange);
});

// Call on page load to set initial state
handleEventTypeChange();

// People and Tribes Management Functions
async function addPerson(e) {
    e.preventDefault();
    if (!currentUser) return;

    const fullName = document.getElementById('personName').value.trim();
    const [firstName, ...lastNameParts] = fullName.split(' ');
    const lastName = lastNameParts.join(' ');

    if (!firstName || !lastName) {
        alert('Please enter both first and last name');
        return;
    }

    try {
        const peopleRef = ref(database, `${getUserRef()}/people`);
        await push(peopleRef, {
            firstName,
            lastName
        });
        document.getElementById('personName').value = '';
    } catch (error) {
        console.error('Error adding person:', error);
        alert('Error adding person');
    }
}

function renderPeople(people) {
    const peopleList = document.getElementById('peopleList');
    if (!peopleList) return;

    const sortedPeople = sortPeopleArray(people);
    peopleList.innerHTML = sortedPeople.map(([id, person]) => `
        <div class="person-item">
            <span>${person.firstName} ${person.lastName}</span>
            <button onclick="deletePerson('${id}')" class="action-button">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `).join('');

    updateMemberCheckboxes(sortedPeople);
}

function updateMemberCheckboxes(sortedPeople) {
    const container = document.getElementById('memberCheckboxes');
    if (!container) return;

    container.innerHTML = sortedPeople.map(([id, person]) => `
        <label>
            <input type="checkbox" name="members" value="${id}">
            ${person.firstName} ${person.lastName}
        </label>
    `).join('');
}

async function createTribe(e) {
    e.preventDefault();
    if (!currentUser) return;

    const tribeName = document.getElementById('tribeName').value.trim();
    const selectedMembers = Array.from(document.querySelectorAll('#memberCheckboxes input:checked'))
        .map(cb => cb.value);

    if (!tribeName) {
        alert('Please enter a group name');
        return;
    }

    if (selectedMembers.length === 0) {
        alert('Please select at least one member');
        return;
    }

    try {
        const tribesRef = ref(database, `${getUserRef()}/tribes${currentEditingTribeId ? `/${currentEditingTribeId}` : ''}`);
        await (currentEditingTribeId ? set(tribesRef, {
            name: tribeName,
            members: selectedMembers
        }) : push(tribesRef, {
            name: tribeName,
            members: selectedMembers
        }));
        
        // Reset form and state
        document.getElementById('tribeName').value = '';
        document.querySelectorAll('#memberCheckboxes input').forEach(cb => cb.checked = false);
        document.getElementById('tribeFormSubmit').textContent = 'Create Group';
        currentEditingTribeId = null;
    } catch (error) {
        console.error('Error managing group:', error);
        alert('Error managing group');
    }
}

function renderTribes(tribes, people) {
    const tribesList = document.getElementById('tribesList');
    if (!tribesList) return;

    tribesList.innerHTML = Object.entries(tribes).map(([id, tribe]) => {
        const memberNames = tribe.members
            .map(memberId => {
                const person = people[memberId];
                return person ? `${person.firstName} ${person.lastName}` : 'Unknown';
            })
            .join(', ');

        return `
            <div class="tribe-item">
                <div class="tribe-info">
                    <div class="tribe-name">${tribe.name}</div>
                    <div class="members-list">${memberNames}</div>
                </div>
                <div class="tribe-actions">
                    <button class="action-button edit" onclick="editTribe('${id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                    </button>
                    <button class="action-button delete" onclick="deleteTribe('${id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.editTribe = async function(tribeId) {
    if (!currentUser) return;
    
    try {
        const tribeRef = ref(database, `${getUserRef()}/tribes/${tribeId}`);
        const tribeSnap = await get(tribeRef);
        const tribeData = tribeSnap.val();
        
        if (!tribeData) {
            throw new Error('Group not found');
        }

        // Populate form with existing data
        document.getElementById('tribeName').value = tribeData.name;
        
        // Check the corresponding member checkboxes
        document.querySelectorAll('#memberCheckboxes input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = tribeData.members.includes(checkbox.value);
        });

        // Update form submit button and show cancel button
        const submitBtn = document.getElementById('tribeFormSubmit');
        submitBtn.textContent = 'Update Group';
        
        // Store the editing tribe ID
        currentEditingTribeId = tribeId;

        // Scroll to the form
        document.getElementById('tribeForm').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading group for editing:', error);
        alert('Error loading group for editing');
    }
};

function populateTribeDropdown(tribes) {
    const select = document.getElementById('tribeSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Choose a group...</option>' +
        Object.entries(tribes)
            .map(([id, tribe]) => `<option value="${id}">${tribe.name}</option>`)
            .join('');
}

window.deletePerson = async function(personId) {
    if (!currentUser || !confirm('Are you sure you want to remove this person?')) return;
    
    try {
        await remove(ref(database, `${getUserRef()}/people/${personId}`));
    } catch (error) {
        console.error('Error deleting person:', error);
        alert('Error deleting person');
    }
};

window.deleteTribe = async function(tribeId) {
    if (!currentUser || !confirm('Are you sure you want to remove this group?')) return;
    
    try {
        await remove(ref(database, `${getUserRef()}/tribes/${tribeId}`));
    } catch (error) {
        console.error('Error deleting tribe:', error);
        alert('Error deleting group');
    }
};
// Add this to your auth state change handler or where you load user data
function updateUserProfile(user) {
    if (user) {
        const userName = document.getElementById('userName');
        const premiumBadge = document.getElementById('premiumBadge');
        
        // Set user name
        userName.textContent = user.displayName;
        
        // Show premium badge for beta users
        // You'll need to check your database for the beta status
        const userRef = ref(database, `users/${user.uid}`);
        get(userRef).then((snapshot) => {
            if (snapshot.exists()) {
                const userData = snapshot.val();
                // Assuming you have a 'beta' field in your user data
                if (userData.beta === true) {
                    premiumBadge.classList.add('visible');
                } else {
                    premiumBadge.classList.remove('visible');
                }
            }
        });
    }
}
// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Add authentication event listeners
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    const emailLoginSubmitBtn = document.getElementById('emailLoginSubmitBtn');
    const emailSignupBtn = document.getElementById('emailSignupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const showSignupBtn = document.getElementById('showSignupBtn');

    googleLoginBtn?.addEventListener('click', loginWithGoogle);
    emailLoginBtn?.addEventListener('click', () => switchTab('login'));
    emailLoginSubmitBtn?.addEventListener('click', loginWithEmail);
    emailSignupBtn?.addEventListener('click', signupWithEmail);
    logoutBtn?.addEventListener('click', logout);
    showSignupBtn?.addEventListener('click', () => switchTab('signup'));

    // Add form listeners
    document.getElementById('eventForm')?.addEventListener('submit', createEvent);
    document.getElementById('personForm')?.addEventListener('submit', addPerson);
    document.getElementById('tribeForm')?.addEventListener('submit', createTribe);
    document.getElementById('profileForm')?.addEventListener('submit', updateProfileInfo);
    
    // Add date input event listeners
    const startDateInput = document.getElementById('startDateInput');
    const endDateInput = document.getElementById('endDateInput');
    const specificDateInput = document.getElementById('specificDateInput');

    [startDateInput, endDateInput, specificDateInput].forEach(input => {
        input.addEventListener('change', handleEventTypeChange);
    });

    // Add event type radio listeners
    document.querySelectorAll('input[name="eventType"]')?.forEach(radio => {
        radio.addEventListener('change', handleEventTypeChange);
    });

    // Add tab switching listeners for both nav buttons and settings button
    document.querySelectorAll('.tab-button, .settings-button')?.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Initialize mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    }

    // Add window resize handler
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            document.querySelector('.sidebar').style.transform = 'translateX(0)';
        }
    });

    // Add select all members button handler
    document.getElementById('selectAllMembers')?.addEventListener('click', () => {
        document.querySelectorAll('#memberCheckboxes input').forEach(cb => cb.checked = true);
    });

    // Initialize auth state observer
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('mainContainer').style.display = 'block';
            document.getElementById('userName').textContent = user.displayName || user.email;

            // Populate profile form
            const [firstName, lastName] = (user.displayName || '').split(' ');
            document.getElementById('profileFirstName').value = firstName || '';
            document.getElementById('profileLastName').value = lastName || '';
            document.getElementById('profileEmail').value = user.email || '';
            
            // Initialize app data
            loadEvents();
            
            // Set up real-time listeners for people and tribes
            const peopleRef = ref(database, `${getUserRef()}/people`);
            const tribesRef = ref(database, `${getUserRef()}/tribes`);
            
            onValue(peopleRef, (snapshot) => {
                const people = snapshot.val() || {};
                renderPeople(people);
            });
            
            onValue(tribesRef, (snapshot) => {
                get(peopleRef).then(peopleSnap => {
                    const tribes = snapshot.val() || {};
                    const people = peopleSnap.val() || {};
                    renderTribes(tribes, people);
                    populateTribeDropdown(tribes, people);
                });
            });
        } else {
            currentUser = null;
            window.location.href = 'login.html';
        }
    });

    // Initialize views
    handleEventTypeChange();

    // Add event listener for back to list button
    document.getElementById('backToListBtn')?.addEventListener('click', showEventsList);

    // Add section tab switching listeners
    document.querySelectorAll('.section-tab')?.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and sections
            document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding section
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.section}Section`).classList.add('active');
        });
    });

    // Add delete account button listener
    document.getElementById('deleteAccountBtn')?.addEventListener('click', deleteAccount);
});

// Attach necessary functions to window object for HTML access
window.addDate = addDate;
window.removeDate = function(startDate, endDate) {
    if (startDate === 'dayOfWeek') {
        selectedDates = selectedDates.filter(d => d.type !== 'dayOfWeek');
    } else {
        selectedDates = selectedDates.filter(d => !(d.start === startDate && d.end === endDate));
    }
    renderDates();
};
window.showEventsList = showEventsList;
window.showEventDetail = showEventDetail;
// Make switchTab available globally
window.switchTab = switchTab;
window.addLocation = addLocation;
window.addDaysOfWeek = addDaysOfWeek;
window.deleteLocation = deleteLocation;
window.resetLocationForm = resetLocationForm;
window.updateLocation = updateLocation;
window.editLocation = editLocation;
