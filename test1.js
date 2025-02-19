const data = require('./data.json');

function transformData(singleData) {
    // Initialize an array to store the transformed subTab data
    let transformedData = [];

    // Loop through each subTab
    singleData.gmcSubTab.forEach(subTab => {
        // Initialize an array to store the questions for this subTab
        let questions = [];

        // Loop through each label in the subTab
        subTab.gmcLabelForSubTab.forEach(label => {
            // Loop through each question in the label
            label.gmcQuestionAnswers.forEach(question => {
                let selectedAnswer = null;

                // If selectedAnswer is a string, use it directly
                if (typeof question.selectedAnswer === 'string') {
                    selectedAnswer = question.selectedAnswer;
                } else {
                    // Otherwise, find the answer object by matching the `selectedAnswer` ID
                    const selectedAnswerObj = question.answer.find(ans => ans._id === question.selectedAnswer);
                    if (selectedAnswerObj) {
                        selectedAnswer = selectedAnswerObj.answer;
                    }
                }

                // If selectedAnswer is found, add the question and selectedAnswer to the array
                if (selectedAnswer) {
                    questions.push({
                        question: question.question,
                        selectedAnswer: selectedAnswer
                    });
                }
            });
        });

        // Add the transformed subTab data (subTabName and its questions) to transformedData
        transformedData.push({
            [subTab.subTabName]: questions.length > 0 ? questions : []
        });
    });

    return transformedData;
}

// Initialize the array to store all key-value pairs
let keyPair = [];

// Loop through e
