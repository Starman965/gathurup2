// app.js 12/4/2024
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
let lastSelectedDate = null; // Add this line
let editingLocationIndex = null;

// Utility Functions
function getUserRef() {
    if (!currentUser) {
        console.error('No user logged in');
        throw new Error('No user logged in');
    }
    return `users/${currentUser.uid}`;
}

function formatDateForDisplay(dateStr, timeStr, timezone) {
    let date;
    if (timeStr) {
        date = new Date(`${dateStr}T${timeStr}:00`);
    } else {
        date = new Date(`${dateStr}T00:00:00`); // Use local time zone
    }

    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }

    return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit',
        hour: timeStr ? '2-digit' : undefined,
        minute: timeStr ? '2-digit' : undefined,
        timeZone: timezone
    }).format(date);
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
    const eventUrl = `${window.location.origin}/gathurup2/event.html?event=${eventId}&user=${currentUser.uid}`;
    
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
    const firstName = document.getElementById('signupFirstNameInput').value;
    const lastName = document.getElementById('signupLastNameInput').value;
    const email = document.getElementById('signupEmailInput').value;
    const password = document.getElementById('signupPasswordInput').value;
    const confirmPassword = document.getElementById('signupConfirmPasswordInput').value;
    const timezone = document.getElementById('signupTimezoneInput').value;

    if (password !== confirmPassword) {
        alert("Passwords don't match");
        return;
    }

    if (password.length < 6) {
        alert("Password must be at least 6 characters");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update Firebase Auth Profile
        await updateProfile(user, {
            displayName: `${firstName} ${lastName}`
        });

        // Create user profile in Realtime Database
        const userRef = ref(database, `users/${user.uid}/profile`);
        await set(userRef, {
            firstName: firstName,
            lastName: lastName,
            email: email,
            timezone: timezone,
            subscription: 'free', // Set subscription to beta
            version: 'beta', // Set version to beta
            createdAt: new Date().toISOString()
        });

        window.location.href = 'app.html';
    } catch (error) {
        console.error("Error signing up:", error);
        alert(error.message || "Error signing up");
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
    const newTimezone = document.getElementById('profileTimezone').value;
    
    if (!currentUser) return;
    
    try {
        const updates = [];
        
        // Only compare with existing displayName if it exists
        if (!currentUser.displayName || 
            newFirstName !== (currentUser.displayName.split(' ')[0] || '') || 
            newLastName !== (currentUser.displayName.split(' ')[1] || '')) {
            updates.push(updateProfile(currentUser, { 
                displayName: `${newFirstName} ${newLastName}` 
            }));
        }
        
        // Update email if changed
        if (newEmail !== currentUser.email) {
            updates.push(updateEmail(currentUser, newEmail));
        }
        
        await Promise.all(updates);
        
        // Update database profile
        const userRef = ref(database, `users/${currentUser.uid}/profile`);
        const profileSnapshot = await get(userRef);
        const existingProfile = profileSnapshot.val() || {};
        
        await set(userRef, {
            ...existingProfile,
            firstName: newFirstName,
            lastName: newLastName,
            email: newEmail,
            timezone: newTimezone || existingProfile.timezone || 'UTC',
            subscription: existingProfile.subscription || 'free',
            updatedAt: new Date().toISOString(),
            createdAt: existingProfile.createdAt || new Date().toISOString()
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
     // Show the events table header
     document.getElementById('eventsTableHeader').style.display = 'flex';
     
    const eventsList = document.getElementById('eventsList');
    const eventDetailView = document.getElementById('eventDetailView');
     // Show the events table header
    document.getElementById('eventsTableHeader').style.display = 'flex';

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
        includeDatePreferences: document.getElementById('includeDatePreferences').checked,
        includeLocationPreferences: document.getElementById('includeLocationPreferences').checked, // Always read the current state of the checkbox
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
                time: dateRange.time || null, // Ensure time is always defined
                displayRange: dateRange.start === dateRange.end ? 
                    formatDateForDisplay(dateRange.start, dateRange.time, document.getElementById('profileTimezone').value) :
                    `${formatDateForDisplay(dateRange.start, '00:00', document.getElementById('profileTimezone').value)} to ${formatDateForDisplay(dateRange.end, '23:59', document.getElementById('profileTimezone').value)}`
            };
        }),
        locations: selectedLocations.map(location => ({
            name: location.name,
            description: location.description,
            imageUrl: location.imageUrl
        })),
        userId: currentUser.uid,
        created: new Date().toISOString(),
        createdInTimezone: document.getElementById('profileTimezone').value, // sets timezone for event creation
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
            
            // Preserve existing votes
            const existingVotes = existingEvent.votes || {};
            eventData.votes = { ...existingVotes };

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
            // Redirect to events list page after creating a new event
            switchTab('events');
            showEventsList();
        }
        
        // Reset form and state
        resetEventForm();
        
    } catch (error) {
        console.error("Error managing event: ", error);
        alert("Error managing event. Please try again.");
    }
}
function resetCreateEventForm() {
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDescription').value = '';
    document.getElementById('tribeSelect').value = '';
    document.querySelector('input[name="eventType"][value="specific"]').checked = true;

    document.getElementById('specificDateInput').value = '';
    document.getElementById('startDateInput').value = '';
    document.getElementById('endDateInput').value = '';
    selectedDates = [];
    selectedLocations = [];
    renderDates();
    renderLocations();
}
function resetEventForm() {
    document.getElementById('eventForm').reset();
    selectedDates = [];
    selectedLocations = [];
    renderDates();
    renderLocations();
    // Clear form fields
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDescription').value = '';
    document.getElementById('tribeSelect').value = '';

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

    // Reset the button text and onclick handler
    const addLocationBtn = document.getElementById('addLocationBtn');
    addLocationBtn.textContent = 'Add Location';
    addLocationBtn.setAttribute('onclick', 'addLocation()');
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
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-2 14H7L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M5 6l1-3h12l1 3"></path>
                 </svg>
                </button>
            </div>
        </div>
    `).join('');
}


// Date Management Functions
window.addDate = function() {
    const specificDateInput = document.getElementById('specificDateInput');
    const specificTimeHour = document.getElementById('specificTimeHour').value;
    const specificTimeMinute = document.getElementById('specificTimeMinute').value;
    const specificTimePeriod = document.getElementById('specificTimePeriod').value;
    const addTimesCheckbox = document.getElementById('addTimesCheckbox');
    const startDateInput = document.getElementById('startDateInput');
    const endDateInput = document.getElementById('endDateInput');
    const eventType = document.querySelector('input[name="eventType"]:checked').value;
    const timezone = document.getElementById('profileTimezone').value;

    let specificTime = null;
    if (addTimesCheckbox.checked) {
        let hour = parseInt(specificTimeHour, 10);
        if (specificTimePeriod === 'PM' && hour !== 12) {
            hour += 12;
        } else if (specificTimePeriod === 'AM' && hour === 12) {
            hour = 0;
        }
        specificTime = `${hour.toString().padStart(2, '0')}:${specificTimeMinute}`;
    }

    if (eventType === 'specific' && specificDateInput.value) {
        if (addTimesCheckbox.checked && !specificTime) {
            alert('Please add a time for the single-day event.');
            return;
        }
        selectedDates.push({
            start: specificDateInput.value,
            end: specificDateInput.value,
            time: specificTime,
            displayRange: formatDateForDisplay(specificDateInput.value, specificTime, timezone)
        });
    } else if (eventType === 'range' && startDateInput.value && endDateInput.value) {
        selectedDates.push({
            start: startDateInput.value,
            end: endDateInput.value,
            time: null,
            displayRange: `${formatDateForDisplay(startDateInput.value, null, timezone)} to ${formatDateForDisplay(endDateInput.value, null, timezone)}`
        });
    }

    renderDates();
}
// Call setDatePickerDefaults when the event type changes
function handleEventTypeChange() {
    const eventType = document.querySelector('input[name="eventType"]:checked')?.value;
    const specificDateSection = document.getElementById('specificDateSection');
    const rangeDateSection = document.getElementById('rangeDateSection');

    specificDateSection.style.display = 'none';
    rangeDateSection.style.display = 'none';
   

    // Show the appropriate section based on event type
    switch(eventType) {
        case 'specific':
            specificDateSection.style.display = 'block';
            break;
        case 'range':
            rangeDateSection.style.display = 'block';
            break;
    }

}

function renderDates() {
    const datesList = document.getElementById('datesList');
    const timezone = document.getElementById('profileTimezone').value;

    // Sort dates in date order
    selectedDates.sort((a, b) => new Date(a.start) - new Date(b.start));

    datesList.innerHTML = selectedDates.map((date, index) => {
        const displayText = date.start === date.end 
            ? formatDateForDisplay(date.start, date.time, timezone)
            : `${formatDateForDisplay(date.start, null, timezone)} to ${formatDateForDisplay(date.end, null, timezone)}`;
        return `
            <div class="date-row" data-index="${index}">
                <span class="date-display">${displayText}</span>
                <button class="action-button delete" onclick="removeDate(${index})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6l-2 14H7L5 6"></path>
                        <path d="M10 11v6"></path>
                        <path d="M14 11v6"></path>
                        <path d="M5 6l1-3h12l1 3"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

async function removeDate(index) {
    if (confirm('Are you sure you want to delete this date? This action cannot be undone.')) {
        selectedDates.splice(index, 1);
        renderDates();

        // Update database if editing an event
        if (editingEventId) {
            const eventRef = ref(database, `${getUserRef()}/events/${editingEventId}/dates`);
            await set(eventRef, selectedDates);
        }
    }
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
                            <polyline points="7 10 12 15 17 10"></polyline>
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
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-2 14H7L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M5 6l1-3h12l1 3"></path>
                 </svg>
                    </button>
                    <button class="action-button share" onclick="copyEventLink('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                    </button>
                    <button class="action-button" onclick="openEventLink('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
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
    // Hide the events table header
    document.getElementById('eventsTableHeader').style.display = 'none';

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
// Ensure size is included in tribeInfo
eventData.tribeInfo.size = eventData.tribeInfo.members.length;
        // Ensure dates and locations are arrays
        eventData.dates = eventData.dates || [];
        eventData.locations = eventData.locations || [];

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

function formatDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const startDay = days[start.getDay()];
    const endDay = days[end.getDay()];
    const startFormatted = start.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    const endFormatted = end.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    
    if (startDate === endDate) {
        return `${startDay}, ${startFormatted}`;
    }
    return `${startDay}, ${startFormatted} to ${endDay}, ${endFormatted}`;
}

function renderVotesSummary(eventData) {
    const votes = eventData.votes || {};
    const tribeMembers = eventData.tribeInfo.size || 0;

    // Calculate votes for each date as before
    const votesByDate = eventData.dates.map((date, index) => {
        const dateKey = date.time ? 
            `${date.start}T${date.time}` : 
            `${date.start}`;
        
        const votesForDate = Object.entries(votes).map(([voter, preferences]) => ({
            voter,
            vote: preferences.datePreferences?.[dateKey] || 'no-response'
        }));

        const yesVotes = votesForDate.filter(v => v.vote === 'yes').length;
        const noVotes = votesForDate.filter(v => v.vote === 'no').length;
        const maybeVotes = votesForDate.filter(v => v.vote === 'maybe').length;

        return {
            date,
            yesVotes,
            noVotes,
            maybeVotes,
            noResponseCount: tribeMembers - (yesVotes + noVotes + maybeVotes),
            voters: votesForDate
        };
    });

    // Find the date with most yes votes
    const maxYesVotes = Math.max(...votesByDate.map(v => v.yesVotes));

    return votesByDate.map((vote, index) => {
        const displayDate = vote.date.start === vote.date.end ?
            (eventData.type === 'specific' && vote.date.time ? 
                formatDateForDisplay(vote.date.start, vote.date.time, document.getElementById('profileTimezone').value) :
                formatDateRange(vote.date.start, vote.date.end)) :
            formatDateRange(vote.date.start, vote.date.end);

        return `
<div class="vote-card ${vote.yesVotes === maxYesVotes && vote.yesVotes > 0 ? 'most-voted' : ''}">
    <div class="vote-card-header">
        <div class="vote-date">${displayDate}</div>
    </div>
    <div class="vote-stats">
        <div class="stat-item yes-votes">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            ${vote.yesVotes}
        </div>
        <div class="stat-item no-votes">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
            </svg>
            ${vote.noVotes}
        </div>
        <div class="stat-item no-response">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.5 9a3 3 0 0 1 5 1c0 2-3 3-3 3"/>
                <circle cx="12" cy="17" r="1"/> 
            </svg>
            ${vote.noResponseCount}
        </div>
    </div>
    <div class="vote-details-button">
        <button class="vote-details-toggle" onclick="toggleVoteDetails('date-${index}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
            </svg>
            Show Responses
        </button>
    </div>
    <div id="date-${index}" class="vote-details-panel">
        <div class="voter-list">
            ${vote.voters.map(voter => `
                <div class="voter-item">
                    <span class="voter-name">${voter.voter}</span>
                    <span class="vote-type ${voter.vote}">${voter.vote}</span>
                </div>
            `).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Modify renderLocationVotesSummary to highlight the most voted location
function renderLocationVotesSummary(eventData) {
    const votes = eventData.votes || {};
    const locationVotes = {};

    // Count votes for each location
    Object.values(votes).forEach(vote => {
        if (vote.locationPreferences && vote.locationPreferences.selectedLocation) {
            const location = vote.locationPreferences.selectedLocation;
            locationVotes[location] = (locationVotes[location] || 0) + 1;
        }
    });

    // Find the location with most votes
    const maxVotes = Math.max(...Object.values(locationVotes), 0);

    return eventData.locations.map((location, index) => {
        const voteCount = locationVotes[location.name] || 0;
        const votesForLocation = Object.entries(votes).map(([voter, preferences]) => ({
            voter,
            vote: preferences.locationPreferences?.selectedLocation === location.name ? 'yes' : 'no'
        }));

        return `
            <div class="vote-card ${voteCount === maxVotes && voteCount > 0 ? 'most-voted' : ''}">
                <div class="vote-card-header">
                    <div class="location-name">${location.name}</div>
                    <button class="vote-details-toggle" onclick="toggleVoteDetails('location-${index}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4"/>
                            <path d="M12 8h.01"/>
                        </svg>
                        Show Details
                    </button>
                </div>
                <div class="vote-stats">
                    <div class="stat-item total-votes">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        ${voteCount}
                    </div>
                </div>
                <div id="location-${index}" class="vote-details-panel">
                    <div class="voter-list">
                        ${votesForLocation.map(voter => `
                            <div class="voter-item">
                                <span class="voter-name">${voter.voter}</span>
                                <span class="vote-type ${voter.vote}">${voter.vote}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
window.toggleVoteDetails = function(id) {
    const panel = document.getElementById(id);
    if (panel) {
        panel.classList.toggle('active');
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
                                             ${eventData.tribeInfo.name} (${eventData.tribeInfo.size})</div>
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
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-2 14H7L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M5 6l1-3h12l1 3"></path>
                 </svg>
                        </button>
                        <button class="action-button share" onclick="copyEventLink('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                    </button>
                    <button class="action-button" onclick="openEventLink('${eventId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
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
                    Dates
                </h3>
                <div class="votes-summary">
                    ${renderVotesSummary(eventData)}
                </div>
            </div>

            <div class="section-card">
                <h3 class="section-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
                    </svg>
                    Locations
                </h3>
                <div class="votes-summary">
                    ${renderLocationVotesSummary(eventData)}
                </div>
            </div>
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
        document.getElementById('eventTitle').value = eventData.title || '';
        document.getElementById('eventDescription').value = eventData.description || '';
        document.getElementById('tribeSelect').value = eventData.tribeId || '';
        
        // Set event type
        const eventTypeRadio = document.querySelector(`input[name="eventType"][value="${eventData.type}"]`);
        if (eventTypeRadio) {
            eventTypeRadio.checked = true;
            handleEventTypeChange();
        }
        
        // Load existing dates
        selectedDates = (eventData.dates || []).map(date => {
            if (date.type === 'dayOfWeek') {
                return {
                    type: 'dayOfWeek',
                    days: date.days
                };
            }
            return {
                start: date.start,
                end: date.end,
                time: date.time
            };
        });
        
        renderDates();
        
        // Load existing locations
        selectedLocations = eventData.locations || [];
        renderLocations();
        
        // Set includeDatePreferences and includeLocationPreferences checkboxes
        document.getElementById('includeDatePreferences').checked = eventData.includeDatePreferences || false;
        document.getElementById('includeLocationPreferences').checked = eventData.includeLocationPreferences || false;
        
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

        // Hide event detail view
        document.getElementById('eventDetailView').style.display = 'none';
    } catch (error) {
        console.error('Error loading event for editing:', error);
        alert('Error loading event for editing');
    }
}
function handleAddTimesCheckbox() {
    const eventTypeRadios = document.querySelectorAll('input[name="eventType"]');
    const addTimesCheckbox = document.getElementById('addTimesCheckbox');
    const timeFields = document.getElementById('timeFields');

    eventTypeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'specific') {
                addTimesCheckbox.parentElement.style.display = 'block';
            } else {
                addTimesCheckbox.parentElement.style.display = 'none';
                addTimesCheckbox.checked = false;
                timeFields.style.display = 'none';
            }
        });
    });

    addTimesCheckbox.addEventListener('change', function() {
        if (this.checked) {
            timeFields.style.display = 'flex';
        } else {
            timeFields.style.display = 'none';
        }
    });

    // Initialize visibility based on the default selected radio
    if (document.querySelector('input[name="eventType"]:checked').value === 'specific') {
        addTimesCheckbox.parentElement.style.display = 'block';
    } else {
        addTimesCheckbox.parentElement.style.display = 'none';
    }
}
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
  
    // Call resetCreateEventForm if the create event tab is selected
    if (tabName === 'createEvent') {
        resetCreateEventForm();
    }
       // Call loadEvents if the events tab is selected
     if (tabName === 'events') {
        loadEvents();
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
                     <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-2 14H7L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M5 6l1-3h12l1 3"></path>
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
                            <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-2 14H7L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M5 6l1-3h12l1 3"></path>
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
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    const emailLoginSubmitBtn = document.getElementById('emailLoginSubmitBtn');
    const emailSignupBtn = document.getElementById('emailSignupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const showSignupBtn = document.getElementById('showSignupBtn');

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
    
    // Add collapsible event listeners
    const collapsibles = document.querySelectorAll('.collapsible');
    collapsibles.forEach(collapsible => {
        collapsible.addEventListener('click', function() {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            if (content.style.display === 'block') {
                content.style.display = 'none';
            } else {
                content.style.display = 'block';
            }
        });
    });

    // Add date input event listeners
    const startDateInput = document.getElementById('startDateInput');
    const endDateInput = document.getElementById('endDateInput');
    const specificDateInput = document.getElementById('specificDateInput');

    [startDateInput, endDateInput, specificDateInput].forEach(input => {
        input?.addEventListener('change', handleEventTypeChange);
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

 document.addEventListener('DOMContentLoaded', () => {
    const collapsibles = document.querySelectorAll('.collapsible');
    collapsibles.forEach(collapsible => {
        collapsible.addEventListener('click', function() {
            this.classList.toggle('active');
            const content = this.nextElementSibling;
            if (content.style.display === 'block') {
                content.style.display = 'none';
            } else {
                content.style.display = 'block';
            }
        });
    });

    // Handle Add Start Times checkbox visibility
    const addTimesCheckbox = document.getElementById('addTimesCheckbox');
    const timeFields = document.getElementById('timeFields');
    addTimesCheckbox.addEventListener('change', function() {
        if (this.checked) {
            timeFields.style.display = 'flex';
        } else {
            timeFields.style.display = 'none';
        }
    });

    // Initialize visibility based on the checkbox state
    if (addTimesCheckbox.checked) {
        timeFields.style.display = 'flex';
    } else {
        timeFields.style.display = 'none';
    }
});
 // Call handleAddTimesCheckbox to set up the event listeners for the "Add Times" checkbox
 handleAddTimesCheckbox();


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

            // Fetch and set the user's timezone
            const userRef = ref(database, `users/${user.uid}/profile`);
            get(userRef).then((snapshot) => {
                if (snapshot.exists()) {
                    const userProfile = snapshot.val();
                    document.getElementById('profileTimezone').value = userProfile.timezone || 'UTC';
                }
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

    renderEventSettings();
});

// Attach necessary functions to window object for HTML access
5
window.removeDate = async function(index) {
    if (confirm('Are you sure you want to delete this date? This action cannot be undone.')) {
        selectedDates.splice(index, 1);
        renderDates();

        // Update database if editing an event
        if (editingEventId) {
            const eventRef = ref(database, `${getUserRef()}/events/${editingEventId}/dates`);
            await set(eventRef, selectedDates);
        }
    }
};
window.showEventsList = showEventsList;
window.showEventDetail = showEventDetail;
// Make switchTab available globally
window.switchTab = switchTab;
window.addLocation = addLocation;
window.addDate = addDate
window.deleteLocation = deleteLocation;
window.resetLocationForm = resetLocationForm;
window.updateLocation = updateLocation;
window.editLocation = editLocation;


function renderEventSettings() {
    const eventSettingsContainer = document.getElementById('eventSettingsContainer');
    const includeLocationPreferencesCheckbox = document.getElementById('includeLocationPreferences');
    const includeDatePreferencesCheckbox = document.getElementById('includeDatePreferences');

    const includeLocationPreferences = selectedLocations.length > 0 || (includeLocationPreferencesCheckbox && includeLocationPreferencesCheckbox.checked);
    const includeDatePreferences = includeDatePreferencesCheckbox && includeDatePreferencesCheckbox.checked;

    eventSettingsContainer.innerHTML = `
        <div class="section-card">
            <h3>Group Event Page Settings</h3>
             <p class="section-tip">Tip: Be sure to include the sections you need on your event page for users to see and respond to. Remove sections you are not using.</p>
             <div class="form-group">
                <label>Include on Group Event Page:</label>
                <div class="checkbox-grid">
                    <label class="checkbox">
                        <input type="checkbox" id="includeDatePreferences" ${includeDatePreferences ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        Date Section
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" id="includeLocationPreferences" ${includeLocationPreferences ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        Location Section
                    </label>
                </div>
            </div>
        </div>
    `;
}

// Call renderEventSettings when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    renderEventSettings();
    // ...existing code...
});

async function renderDatesList(dates, userId, eventId) {
    const datesList = document.getElementById('datesList');
    datesList.innerHTML = '';

    dates.forEach(date => {
        const dateCard = document.createElement('div');
        dateCard.className = 'date-card';
        dateCard.dataset.date = date.date;
        dateCard.innerHTML = `
            <div class="date-header" onclick="toggleDate('${date.date}')">
                <span>${formatDateForDisplay(date.date)}</span>
                <svg class="expand-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
            <div class="date-ranges">
                ${date.times.map(time => `
                    <div class="time-slot" data-time-id="${date.date}T${time}">
                        <div class="time-slot-content">
                            <div class="vote-indicator maybe" onclick="toggleVote('${date.date}', '${time}')"></div>
                            <div class="time-info">
                                <p class="time">${formatTimeForDisplay(time, date.date)}</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        datesList.appendChild(dateCard);
    });
}
