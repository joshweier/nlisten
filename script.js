document.addEventListener('DOMContentLoaded', async () => {

    // Define SRS intervals in milliseconds
    const kHour = 60 * 60 * 1000;
    const kDay = 24 * kHour;
    const srsIntervals = [
        0,         // Level 0: Immediate review
        1 * kHour, // Level 1: 1 hour
        12 * kHour,// Level 2: 12 hours
        1 * kDay,  // Level 3: 1 day
        3 * kDay,  // Level 4: 3 days
        7 * kDay,  // Level 5: 7 days
        14 * kDay, // Level 6: 14 days
        30 * kDay, // Level 7: 30 days
        90 * kDay  // Burned
    ];

    let AppData = {
        // High-level data
        sentences: [],          // Core data sentences
        contexts: new Map(),    // Categorized sentences by concept
        progessData: new Map(), // Map to store progress data, index of word to SRS level

        // Question data
        pendingQuestion: [],    // Queue of sentence indices to use for questions
        currentSentence: -1,    // Index of the current sentence
        answerDiv: null,        // Reference to the answer div
        answer: "",

        // Learning progress
        newSentencesPerDay: 10, // Number of new sentences to learn per day
        numLearned: 0,          // Number of sentences learned today

        // Filter data
        filter: null,
    }
    // Load SRS data from local storage when the application starts
    function loadSrsData() {
        const data = localStorage.getItem('srsData');
        if (data) {
            AppData.progessData = JSON.parse(data);
        } else {
            AppData.progressData = {};
        }
    }

    // Save SRS data to local storage whenever it's updated
    function saveSrsData() {
        localStorage.setItem('srsData', JSON.stringify(AppData.progessData));
    }

    function highlightSentence(sentence, contexts, targetIndex) {
        // Create a map to store which part of the target context corresponds to which sub-index
        let contextMap = {};
        const targetContext = contexts[targetIndex];
        if (targetContext) {
            const contextParts = targetContext.split('〜');
            contextParts.forEach((part, subIndex) => {
                const key = `${targetIndex+1}${contextParts.length > 1 ? String.fromCharCode(97 + subIndex) : ''}`; // 97 is ASCII code for 'a'
                contextMap[key] = part;
            });
        }

        // Replace the indexed markers with spans for the target context only
        sentence = sentence.replace(/{(\d+[a-z]?):([^}]+)}/g, function(match, key, text) {
            if (contextMap[key]) {
                return `<span id="context-highlight" class="highlight">${text}</span>`;
            }
            // Remove the unused markup if it doesn't match the target context
            return text;
        });

        return sentence;
    }

    // Shuffle an array
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Load the data from the JSON file
    async function loadData() {
        try {
            // Load the JSON data from the file
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }

            // Pull out the actual structure
            let data = await response.json();
            AppData.sentences = data.sentences;

            // Prep the data
            categorizeData(AppData.sentences);
            loadSrsData();
            queueAvailableQuestions();
        } catch (error) {
            console.error('There was a problem with the fetch operation:', error);
        }
    }

    // Categorize the data by concept
    function categorizeData(data) {
        for (let i = 0; i < data.length; i++) {
            for (const context of data[i].contexts) {
                // Push our ID, not a copy
                if (AppData.contexts.has(context)) {
                    AppData.contexts.get(context).push(i);
                }
                else {
                    AppData.contexts.set(context, [i]);
                }
            }
        }
    }

    // Build a shuffled queue of sentence indices to use for questions
    function queueAvailableQuestions() {
        // Generate an array of indices
        let sentencePool = AppData.sentences.map((_, index) => index);

        // Filter down the data if it exists
        if (AppData.filter) {
            const filters = AppData.filter.split(',');
            // Filter the sentence pool by checked its contexts against a comma-separated list of filters
            sentencePool = sentencePool.filter(index => {
                const sentence = AppData.sentences[index];
                return filters.some(filter => sentence.contexts.includes(filter));
            });
        }

        AppData.pendingQuestion = shuffleArray(sentencePool);
        console.log('Sentences: %d', AppData.pendingQuestion.length);
    }

    // Play the audio for the word
    function playAudio(audioUrl, lockReplay) {
        const audio = new Audio("voxdata/" + audioUrl);
        audio.play();

        // Make audio inactive
        if (lockReplay===true) {
            playAudioButton.classList.add('disabled');
            audio.addEventListener('ended', () => {
                playAudioButton.classList.remove('disabled');
            });
        }
    }

    // Debounce function to delay execution
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function handleInputChange(event) {
        AppData.filter = event.target.value;
        queueAvailableQuestions();
        setReady();
    }
    // Handle the enter key
    function handleKeyDown(event) {
        // Ignore key overrides if we're typing something
        if (filterInput === document.activeElement) {
            return;
        }

        if (event.key === 'Enter') {
            if (nextWordButton.hasAttribute('disabled') === false) {
                setReady();
            }
            else if (blinder.style.display === 'block') {
                hideBlinder();
            }
        }
        else if (event.key === ' ') {
            replayAudio();
        }
        else if (event.key === 'Tab') {
            showSentence();
        }
    }

    function replayAudio() {
        // Don't allow this if we're disabled (i.e. playing audio)
        if (playAudioButton.classList.contains('disabled'))
            return;

        // Play the audio
        const audioUrl = AppData.sentences[AppData.currentSentence].audio;
        playAudio(audioUrl, true);
    }

    function getNextSentence() {
        return AppData.pendingQuestion.pop();
    }

    function showNextQuestion() {
        // Grab the next question
        AppData.currentSentence = getNextSentence();

        // Set up for the question
        const contexts = AppData.sentences[AppData.currentSentence].contexts;
        const randomContext = Math.floor(Math.random() * contexts.length);
        const cleanText = highlightSentence(
            AppData.sentences[AppData.currentSentence].sentence, 
            contexts, 
            randomContext);

        // Clear any existing answers
        answersDiv.innerHTML = "";

        // Construct the answer
        AppData.answer = AppData.sentences[AppData.currentSentence].translation;
        AppData.answerDiv = document.createElement('div');
        AppData.answerDiv.innerHTML = "...";
        answersDiv.appendChild(AppData.answerDiv);

        // Add the example
        exampleSentence.innerHTML = "";

        let exampleDiv = document.createElement('div');
        exampleDiv.innerHTML = cleanText;
        exampleSentence.appendChild(exampleDiv);

        attributionLink.textContent = AppData.sentences[AppData.currentSentence].attribution;
        attributionLink.href = AppData.sentences[AppData.currentSentence].attrurl;
        attributionLink.target = "_blank";

        // exampleSentence.style.display = 'block';
        answerContainer.style.display = 'block';
        nextWordButton.setAttribute('disabled', true);

        // Block out the answer
        showBlinder();

        // Play the audio
        replayAudio();
    }

    function showSentence() {
        // Show the sentence
        exampleSentence.style.display = 'block';
        showSentenceButton.style.display = 'none';
    }

    function markCorrect() {
    }

    function markMissed() {
    }

    function setReady() {
        // Show the main page content
        loadingScreen.style.display = 'none';
        mainContent.style.display = 'block';

        exampleSentence.style.display = 'none';
        showSentenceButton.style.display = 'block';
        nextWordButton.setAttribute('disabled', true);

        // Show the first question
        showNextQuestion();
    }

    function showBlinder() {
        blinder.style.display = 'block';
    }

    function hideBlinder() {
        blinder.style.display = 'none';
        nextWordButton.removeAttribute('disabled');
        AppData.answerDiv.innerHTML = AppData.answer;
    }

    // Cache common elements
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
    const mainContent = document.getElementById('main-content');
    const playAudioButton = document.getElementById('play-audio');
    const showSentenceButton = document.getElementById('show-sentence');
    const userInput = document.getElementById('user-input');
    const submitButton = document.getElementById('submit');
    const startButton = document.getElementById('start-button');
    const wordContainer = document.getElementById('word-container');
    const exampleSentence = document.getElementById('example-sentence');
    const nextWordButton = document.getElementById('next');
    const fetchWords = document.getElementById('fetch-words');
    const progess = document.getElementById('progress');
    const answerContainer = document.getElementById('answer-container');
    const answersDiv = document.getElementById('answers');
    const attributionLink = document.getElementById('attribution-link');
    const blinder = document.getElementById('blinder');
    const filterInput = document.getElementById('input-filter');

    try {
        // Replay the audio
        playAudioButton.addEventListener(
            'click', () => replayAudio());

        // Replay the audio
        startButton.addEventListener(
            'click', () => setReady());

        // Replay the audio
        nextWordButton.addEventListener(
            'click', () => setReady());

        // Show the sentence
        showSentenceButton.addEventListener(
            'click', () => showSentence());

        // Show the sentence
        blinder.addEventListener(
            'click', () => hideBlinder());

        // Hook up the enter key
        document.addEventListener('keydown', handleKeyDown);
        const debouncedInput = debounce(handleInputChange, 1000);
        document.addEventListener('input', debouncedInput);

        // Load our data and prep the page
        await loadData();

        // Hide the loading screen and show the ready button
        loadingText.style.display = 'none';
        startButton.style.display = 'block';

    } catch (error) {
        console.error(error);
    }

});
