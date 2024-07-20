document.addEventListener('DOMContentLoaded', async () => {

    let AppData = {
        sentences: [],          // Core data sentences
        contexts: new Map(),    // Categorized sentences by concept
        pendingQuestion: [],    // Queue of sentence indices to use for questions
        currentSentence: -1     // Index of the current sentence
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
            AppData.pendingQuestion = shuffleArray(AppData.sentences.map((_, index) => index));
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

        // Handle the enter key
        function handleEnterKey(event) {
            if (event.key === 'Enter') {
                if (nextWordButton.style.display !== 'none') {
                    setReady();
                }
            }
        }

        // Given all our possible contexts, find one to use
        function getRandomContext() {
            const keysArray = Array.from(AppData.contexts.keys()); 
            const randomIndex = Math.floor(Math.random() * keysArray.length); 
            return keysArray[randomIndex]; 
        }

        // Given a context, find numSentences sentences that have that context
        function getRandomContextSentences(numSentences) {
            let context = AppData.sentences[AppData.currentSentence].contexts[0]; // FIXME: Randomize
            let possibleSentences = AppData.contexts.get(context).filter((sentence) => sentence !== AppData.currentSentence);

            let sentences = [];
            for (let i = 0; i < numSentences; i++) {
                if (possibleSentences.length === 0) {
                    return sentences;
                }

                const randomIndex = Math.floor(Math.random() * possibleSentences.length);
                sentences.push(possibleSentences[randomIndex]);
                possibleSentences.splice(randomIndex, 1);
            }

            return sentences;
        }

        function replayAudio() {
            // Don't allow this if we're disabled (i.e. playing audio)
            if (playAudioButton.classList.contains('disabled'))
                return;

            // Play the audio
            const audioUrl = AppData.sentences[AppData.currentSentence].audio;
            playAudio(audioUrl, true);
        }

        function showNextQuestion() {
            // Grab the next question
            AppData.currentSentence = AppData.pendingQuestion.pop();
            const answer = AppData.sentences[AppData.currentSentence].translation;

            // Clear any existing answers
            answerContainer.innerHTML = "";

            // Setup for the actual question
            const context = AppData.sentences[AppData.currentSentence].contexts[0]; // FIXME: Randomize
            let randomSentences = getRandomContextSentences(3);
            randomSentences.push(AppData.currentSentence);
            randomSentences = shuffleArray(randomSentences);

            // Build up our list of answers
            for (let sentence of randomSentences) {
                const translation = AppData.sentences[sentence].translation;
                let answerDiv = document.createElement('div');
                answerDiv.innerHTML = translation;
                answerDiv.classList.add('answer', 'shown');

                // Setup the correct answer
                if (sentence === AppData.currentSentence) {
                    answerDiv.dataset.correct = true;
                    answerDiv.classList.add('correct');
                }
                else {
                    // Incorrect answer
                    answerDiv.dataset.correct = false;
                    answerDiv.classList.add('incorrect');
                }

                // Generic click handler
                answerDiv.addEventListener('click', function(event) {
                    if (this.dataset.correct === 'true') {
                        playAudio("../correct.wav");
                    }
                    else {
                        playAudio("../incorrect.mp3");
                    }

                    exampleSentence.style.display = 'block';
                    showSentenceButton.style.display = 'none';

                    // Incorrect
                    nextWordButton.style.display = 'block';

                    // Set everything to be disabled for simplicity
                    const childElements = answerContainer.querySelectorAll('*');
                    childElements.forEach(element => {
                        element.classList.add('disabled');
                        element.classList.remove('shown');
                        if (this.dataset.correct === 'true') {
                            element.classList.remove('incorrect');
                        }
                    });
                });
                answerContainer.appendChild(answerDiv);
            }

            // Add the example
            exampleSentence.innerHTML = "";

            let exampleDiv = document.createElement('div');
            exampleDiv.innerHTML = AppData.sentences[AppData.currentSentence].sentence;
            exampleSentence.appendChild(exampleDiv);

            // exampleSentence.style.display = 'block';
            answerContainer.style.display = 'block';
            nextWordButton.style.display = 'none';

            // Play the audio
            replayAudio();
        }

        function showSentence() {
            // Show the sentence
            exampleSentence.style.display = 'block';
            showSentenceButton.style.display = 'none';
        }

        function setReady() {
            // Show the main page content
            loadingScreen.style.display = 'none';
            mainContent.style.display = 'block';

            exampleSentence.style.display = 'none';
            showSentenceButton.style.display = 'block';

            // Show the first question
            showNextQuestion();
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
        const nextWordButton = document.getElementById('next-word');
        const fetchWords = document.getElementById('fetch-words');
        const progess = document.getElementById('progress');
        const answerContainer = document.getElementById('answer-container');

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

            // Hook up the enter key
            document.addEventListener('keydown', handleEnterKey);

            // Load our data and prep the page
            await loadData();

            // Hide the loading screen and show the ready button
            loadingText.style.display = 'none';
            startButton.style.display = 'block';

        } catch (error) {
            console.error(error);
        }

    });
