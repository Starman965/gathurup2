import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

// Initialize Firebase (add your config)
const firebaseConfig = {
    apiKey: "AIzaSyAiFcWBrqP02_g3Hp3ESbnICMIn3LZQf7Y",
    authDomain: "gathurup2.firebaseapp.com",
    projectId: "gathurup2",
    storageBucket: "gathurup2.firebasestorage.app",
    messagingSenderId: "662651678876",
    appId: "1:662651678876:web:048d46d2df83369d983d59",
    databaseURL: "https://gathurup2-default-rtdb.firebaseio.com"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Function to update stats
function updateStats(data) {
    const users = Object.keys(data?.users || {}).length;
    document.getElementById('totalUsers').textContent = users;

    let totalEvents = 0;
    let totalPeople = 0;
    let totalTribes = 0;

    Object.values(data?.users || {}).forEach(user => {
        totalEvents += Object.keys(user?.events || {}).length;
        totalPeople += Object.keys(user?.people || {}).length;
        totalTribes += Object.keys(user?.tribes || {}).length;
    });

    document.getElementById('totalEvents').textContent = totalEvents;
    document.getElementById('totalPeople').textContent = totalPeople;
}

// Function to populate users table
function populateUsersTable(data) {
    const tableBody = document.getElementById('usersTableBody');
    tableBody.innerHTML = '';

    Object.entries(data?.users || {}).forEach(([userId, userData]) => {
        const profile = userData.profile || {};
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${userId}</td>
            <td>${profile.firstName || '-'}</td>
            <td>${profile.lastName || '-'}</td>
            <td>${profile.email || '-'}</td>
            <td>${profile.subscription || 'free'}</td>
            <td>${profile.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : '-'}</td>
            <td>${Object.keys(userData.events || {}).length}</td>
            <td>${Object.keys(userData.people || {}).length}</td>
            <td>${Object.keys(userData.tribes || {}).length}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Listen for database changes
const dbRef = ref(db);
onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    updateStats(data);
    populateUsersTable(data);
});