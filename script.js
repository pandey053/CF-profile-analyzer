let currentUser = null;
let currentUserSubmissions = [];
let currentUserRatingHistory = [];
let charts = {};

const API_BASE = 'https://codeforces.com/api/';
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

function showElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'block';
        element.classList.add('visible');
    }
}

function hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = 'none';
        element.classList.remove('visible');
    }
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    const errorText = document.querySelector('.error-text');
    
    if (errorElement && errorText) {
        errorText.textContent = message;
        showElement('errorMessage');
    }
}

function hideError() {
    hideElement('errorMessage');
}

function showLoading() {
    showElement('loadingIndicator');
    hideError();
}

function hideLoading() {
    hideElement('loadingIndicator');
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.status !== 'OK') {
                throw new Error(data.comment || 'API Error');
            }
            return data.result;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

async function getUserInfo(handle) {
    const url = `${API_BASE}user.info?handles=${handle}`;
    const users = await fetchWithRetry(url);
    return users[0];
}

async function getUserRating(handle) {
    const url = `${API_BASE}user.rating?handle=${handle}`;
    return await fetchWithRetry(url);
}

async function getUserSubmissions(handle) {
    const url = `${API_BASE}user.status?handle=${handle}&from=1&count=10000`;
    return await fetchWithRetry(url);
}

async function getContestList() {
    const url = `${API_BASE}contest.list?gym=false`;
    return await fetchWithRetry(url);
}

function getRankColor(rank) {
    if (!rank) return '#gray';
    
    const rankColors = {
        'newbie': '#808080',
        'pupil': '#008000',
        'specialist': '#03a89e',
        'expert': '#0000ff',
        'candidate master': '#aa00aa',
        'master': '#ff8c00',
        'international master': '#ff8c00',
        'grandmaster': '#ff0000',
        'international grandmaster': '#ff0000',
        'legendary grandmaster': '#ff0000'
    };
    
    return rankColors[rank.toLowerCase()] || '#gray';
}

function processSubmissions(submissions) {
    const acceptedSubmissions = submissions.filter(sub => sub.verdict === 'OK');
    const uniqueProblems = new Map();
    
    acceptedSubmissions.forEach(sub => {
        const problemKey = `${sub.problem.contestId}-${sub.problem.index}`;
        if (!uniqueProblems.has(problemKey)) {
            uniqueProblems.set(problemKey, sub);
        }
    });
    
    return Array.from(uniqueProblems.values());
}

function calculateProblemStats(acceptedSubmissions) {
    const levels = {};
    const ratings = {};
    const tags = {};
    
    acceptedSubmissions.forEach(sub => {
        const level = sub.problem.index;
        levels[level] = (levels[level] || 0) + 1;
        
        if (sub.problem.rating) {
            const rating = Math.floor(sub.problem.rating / 100) * 100;
            ratings[rating] = (ratings[rating] || 0) + 1;
        }
        
        sub.problem.tags.forEach(tag => {
            tags[tag] = (tags[tag] || 0) + 1;
        });
    });
    
    return { levels, ratings, tags };
}

function calculateContestStats(ratingHistory) {
    if (!ratingHistory.length) return { attended: 0, bestRank: '-', avgRating: '-' };
    
    const attended = ratingHistory.length;
    const bestRank = Math.min(...ratingHistory.map(contest => contest.rank));
    const avgRating = Math.round(
        ratingHistory.reduce((sum, contest) => sum + contest.newRating, 0) / attended
    );
    
    return { attended, bestRank, avgRating };
}

function filterRatingHistoryByTime(ratingHistory, timeFrame) {
    if (!ratingHistory.length || timeFrame === 'All') return ratingHistory;
    
    const now = Date.now() / 1000; // Current time in seconds
    let cutoffTime;
    
    switch (timeFrame) {
        case '1Y':
            cutoffTime = now - (365 * 24 * 60 * 60); // 1 year ago
            break;
        case '6M':
            cutoffTime = now - (6 * 30 * 24 * 60 * 60); // 6 months ago
            break;
        default:
            return ratingHistory;
    }
    
    return ratingHistory.filter(contest => contest.ratingUpdateTimeSeconds >= cutoffTime);
}

function filterContestsByType(ratingHistory, contestType) {
    if (!ratingHistory.length || contestType === 'All') return ratingHistory;
    
    return ratingHistory.filter(contest => {
        const contestName = contest.contestName.toLowerCase();
        
        switch (contestType) {
            case 'Div. 1':
                return contestName.includes('div. 1') && !contestName.includes('div. 2');
            case 'Div. 2':
                return contestName.includes('div. 2');
            case 'Div. 3':
                return contestName.includes('div. 3');
            case 'Educational':
                return contestName.includes('educational');
            default:
                return true;
        }
    });
}

function createRatingChart(ratingHistory, timeFrame = 'All') {
    const ctx = document.getElementById('ratingChart');
    if (!ctx) return;
    
    if (charts.rating) {
        charts.rating.destroy();
    }
    
    const filteredHistory = filterRatingHistoryByTime(ratingHistory, timeFrame);
    
    const labels = filteredHistory.map(contest => {
        const date = new Date(contest.ratingUpdateTimeSeconds * 1000);
        return date.toLocaleDateString();
    });
    
    const ratings = filteredHistory.map(contest => contest.newRating);
    
    charts.rating = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Rating',
                data: ratings,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function createLevelsChart(levels) {
    const ctx = document.getElementById('levelsChart');
    if (!ctx) return;
    
    if (charts.levels) {
        charts.levels.destroy();
    }
    
    const sortedLevels = Object.entries(levels).sort(([a], [b]) => {
        if (a.length !== b.length) return a.length - b.length;
        return a.localeCompare(b);
    });
    
    const labels = sortedLevels.map(([level]) => level);
    const data = sortedLevels.map(([, count]) => count);
    
    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#6366f1'
    ];
    
    charts.levels = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Problems Solved',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                }
            }
        }
    });
}

function createRatingsChart(ratings) {
    const ctx = document.getElementById('ratingsChart');
    if (!ctx) return;
    
    if (charts.ratings) {
        charts.ratings.destroy();
    }
    
    const sortedRatings = Object.entries(ratings)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .filter(([rating]) => parseInt(rating) >= 800);
    
    const labels = sortedRatings.map(([rating]) => rating);
    const data = sortedRatings.map(([, count]) => count);
    
    charts.ratings = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Problems Solved',
                data: data,
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: '#10b981',
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#10b981',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                }
            }
        }
    });
}

function createTagsChart(tags, limit = 10) {
    const ctx = document.getElementById('tagsChart');
    if (!ctx) return;
    
    if (charts.tags) {
        charts.tags.destroy();
    }
    
    const sortedTags = Object.entries(tags)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit);
    
    const labels = sortedTags.map(([tag]) => tag);
    const data = sortedTags.map(([, count]) => count);
    
    charts.tags = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Problems',
                data: data,
                backgroundColor: [
                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                    '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#6366f1',
                    '#14b8a6', '#f43f5e', '#a855f7', '#22c55e', '#eab308'
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#6b7280',
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    cornerRadius: 8
                }
            }
        }
    });
}

function createComparisonChart(user1Data, user2Data) {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;
    
    if (charts.comparison) {
        charts.comparison.destroy();
    }
    
    const maxLength = Math.max(user1Data.length, user2Data.length);
    const labels = Array.from({ length: maxLength }, (_, i) => i + 1);
    
    charts.comparison = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: user1Data.name || 'User 1',
                    data: user1Data.ratings || [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                },
                {
                    label: user2Data.name || 'User 2',
                    data: user2Data.ratings || [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointBackgroundColor: '#ef4444',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#6b7280',
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    cornerRadius: 8,
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(229, 231, 235, 0.5)'
                    },
                    ticks: {
                        color: '#6b7280'
                    }
                }
            }
        }
    });
}

function updateProfile(user) {
    document.getElementById('userName').textContent = user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName} (${user.handle})`
        : user.handle;
    
    const rankElement = document.getElementById('userRank');
    rankElement.textContent = user.rank || 'Unrated';
    rankElement.style.backgroundColor = getRankColor(user.rank);
    
    const ratingElement = document.getElementById('userRating');
    ratingElement.textContent = user.rating || 'Unrated';
    ratingElement.style.backgroundColor = user.rating ? '#10b981' : '#6b7280';
    
    document.getElementById('maxRating').textContent = user.maxRating || 'N/A';
    document.getElementById('contribution').textContent = user.contribution || '0';
    
    const profilePhotoElement = document.getElementById('profilePhoto');
    if (profilePhotoElement && user.avatar) {
        profilePhotoElement.src = user.avatar;
        profilePhotoElement.style.display = 'block';
    } else if (profilePhotoElement) {
        profilePhotoElement.style.display = 'none';
    }
}

function updateQuickStats(acceptedSubmissions, contestStats) {
    document.getElementById('totalSolved').textContent = acceptedSubmissions.length;
    document.getElementById('contestsAttended').textContent = contestStats.attended;
    document.getElementById('bestRank').textContent = contestStats.bestRank;
    document.getElementById('avgRating').textContent = contestStats.avgRating;
}

function updateContestTable(ratingHistory, contestFilter = 'All') {
    const tbody = document.getElementById('contestTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const filteredHistory = filterContestsByType(ratingHistory, contestFilter);
    
    filteredHistory.slice().reverse().forEach(contest => {
        const row = document.createElement('tr');
        
        const delta = contest.newRating - contest.oldRating;
        const deltaClass = delta >= 0 ? 'positive' : 'negative';
        const deltaText = delta >= 0 ? `+${delta}` : delta.toString();
        
        const date = new Date(contest.ratingUpdateTimeSeconds * 1000);
        
        row.innerHTML = `
            <td>${contest.contestName}</td>
            <td>${contest.rank}</td>
            <td class="${deltaClass}">${deltaText}</td>
            <td>${contest.newRating}</td>
            <td>${date.toLocaleDateString()}</td>
        `;
        
        tbody.appendChild(row);
    });
}

async function analyzeUser(handle) {
    if (!handle || handle.trim() === '') {
        showError('Please enter a valid handle');
        return;
    }
    
    showLoading();
    hideError();
    
    hideElement('profileSection');
    hideElement('quickStats');
    hideElement('chartsSection');
    hideElement('contestSection');
    
    try {
        const [user, ratingHistory, submissions] = await Promise.all([
            getUserInfo(handle),
            getUserRating(handle).catch(() => []),
            getUserSubmissions(handle)
        ]);
        
        currentUser = user;
        currentUserSubmissions = submissions;
        currentUserRatingHistory = ratingHistory;
        
        const acceptedSubmissions = processSubmissions(submissions);
        const problemStats = calculateProblemStats(acceptedSubmissions);
        const contestStats = calculateContestStats(ratingHistory);
        
        updateProfile(user);
        updateQuickStats(acceptedSubmissions, contestStats);
        updateContestTable(ratingHistory);
        
        if (ratingHistory.length > 0) {
            createRatingChart(ratingHistory);
        }
        createLevelsChart(problemStats.levels);
        createRatingsChart(problemStats.ratings);
        createTagsChart(problemStats.tags);
        
        showElement('profileSection');
        showElement('quickStats');
        showElement('chartsSection');
        showElement('contestSection');
        
    } catch (error) {
        console.error('Error analyzing user:', error);
        showError(`Error: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function compareUsers(handle1, handle2) {
    if (!handle1 || !handle2 || handle1.trim() === '' || handle2.trim() === '') {
        showError('Please enter both handles for comparison');
        return;
    }
    
    showLoading();
    hideError();
    hideElement('comparisonResults');
    
    try {
        const [user1Data, user2Data] = await Promise.all([
            Promise.all([
                getUserInfo(handle1),
                getUserRating(handle1).catch(() => []),
                getUserSubmissions(handle1)
            ]),
            Promise.all([
                getUserInfo(handle2),
                getUserRating(handle2).catch(() => []),
                getUserSubmissions(handle2)
            ])
        ]);
        
        const [user1, user1Rating, user1Submissions] = user1Data;
        const [user2, user2Rating, user2Submissions] = user2Data;
        
        const user1Accepted = processSubmissions(user1Submissions);
        const user2Accepted = processSubmissions(user2Submissions);
        
        updateComparisonUI(user1, user2, user1Rating, user2Rating, user1Accepted, user2Accepted);
        
        createComparisonChart(
            {
                name: user1.handle,
                ratings: user1Rating.map(c => c.newRating)
            },
            {
                name: user2.handle,
                ratings: user2Rating.map(c => c.newRating)
            }
        );
        
        showElement('comparisonResults');
        
    } catch (error) {
        console.error('Error comparing users:', error);
        showError(`Error: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function updateComparisonUI(user1, user2, user1Rating, user2Rating, user1Accepted, user2Accepted) {
    document.getElementById('user1Name').textContent = user1.handle;
    const user1RankEl = document.getElementById('user1Rank');
    user1RankEl.textContent = user1.rank || 'Unrated';
    user1RankEl.style.backgroundColor = getRankColor(user1.rank);
    
    document.getElementById('user1Rating').textContent = user1.rating || 'Unrated';
    document.getElementById('user1MaxRating').textContent = user1.maxRating || 'N/A';
    document.getElementById('user1Solved').textContent = user1Accepted.length;
    document.getElementById('user1Contests').textContent = user1Rating.length;
    
    document.getElementById('user2Name').textContent = user2.handle;
    const user2RankEl = document.getElementById('user2Rank');
    user2RankEl.textContent = user2.rank || 'Unrated';
    user2RankEl.style.backgroundColor = getRankColor(user2.rank);
    
    document.getElementById('user2Rating').textContent = user2.rating || 'Unrated';
    document.getElementById('user2MaxRating').textContent = user2.maxRating || 'N/A';
    document.getElementById('user2Solved').textContent = user2Accepted.length;
    document.getElementById('user2Contests').textContent = user2Rating.length;
    
    const user1Problems = new Set(user1Accepted.map(s => `${s.problem.contestId}-${s.problem.index}`));
    const user2Problems = new Set(user2Accepted.map(s => `${s.problem.contestId}-${s.problem.index}`));
    const commonProblems = new Set([...user1Problems].filter(p => user2Problems.has(p)));
    
    const user1Contests = new Set(user1Rating.map(c => c.contestId));
    const user2Contests = new Set(user2Rating.map(c => c.contestId));
    const commonContests = new Set([...user1Contests].filter(c => user2Contests.has(c)));
    
    document.getElementById('commonProblems').textContent = commonProblems.size;
    document.getElementById('commonContests').textContent = commonContests.size;
}

document.addEventListener('DOMContentLoaded', function() {
    
    const searchBtn = document.getElementById('searchBtn');
    const handleInput = document.getElementById('handleInput');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const handle = handleInput.value.trim();
            analyzeUser(handle);
        });
    }
    
    if (handleInput) {
        handleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const handle = handleInput.value.trim();
                analyzeUser(handle);
            }
        });
    }
    
    const compareBtn = document.getElementById('compareBtn');
    const user1Handle = document.getElementById('user1Handle');
    const user2Handle = document.getElementById('user2Handle');
    
    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            const handle1 = user1Handle.value.trim();
            const handle2 = user2Handle.value.trim();
            compareUsers(handle1, handle2);
        });
    }
    
    const tagsLimit = document.getElementById('tagsLimit');
    if (tagsLimit) {
        tagsLimit.addEventListener('change', (e) => {
            const limit = parseInt(e.target.value);
            if (currentUser && currentUserSubmissions.length > 0) {
                const acceptedSubmissions = processSubmissions(currentUserSubmissions);
                const problemStats = calculateProblemStats(acceptedSubmissions);
                createTagsChart(problemStats.tags, limit);
            }
        });
    }
    
    const timelineFilterBtns = document.querySelectorAll('.timeline-filter-btn, .rating-filter-btn');
    timelineFilterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const siblings = btn.parentElement.querySelectorAll('.timeline-filter-btn, .rating-filter-btn');
            siblings.forEach(b => b.classList.remove('active'));
            
            btn.classList.add('active');
            
            const timeFrame = btn.textContent.trim();
            
            if (currentUserRatingHistory && currentUserRatingHistory.length > 0) {
                createRatingChart(currentUserRatingHistory, timeFrame);
            }
        });
    });
    
    const contestFilterBtns = document.querySelectorAll('.filter-btn');
    contestFilterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            contestFilterBtns.forEach(b => b.classList.remove('active'));
           
            btn.classList.add('active');
            
            const contestType = btn.textContent.trim();
            
            if (currentUserRatingHistory && currentUserRatingHistory.length > 0) {
                updateContestTable(currentUserRatingHistory, contestType);
            }
        });
    });
    
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
            
            navLinks.forEach(nl => nl.classList.remove('active'));
            link.classList.add('active');
        });
    });
    
    window.addEventListener('scroll', () => {
        const sections = ['home', 'analyze', 'compare', 'about'];
        let currentSection = '';
        
        sections.forEach(section => {
            const element = document.getElementById(section);
            if (element) {
                const rect = element.getBoundingClientRect();
                if (rect.top <= 100 && rect.bottom >= 100) {
                    currentSection = section;
                }
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSection}`) {
                link.classList.add('active');
            }
        });
    });
});

const style = document.createElement('style');
style.textContent = `
    .positive {
        color: #10b981;
        font-weight: 600;
    }
    .negative {
        color: #ef4444;
        font-weight: 600;
    }
`;
document.head.appendChild(style);