const data = require('./data.json')


function transformData(data) {
    // Initialize an object to store the transformed data
    let transformedData = {};

    // Loop through each GMC template data entry

    // Loop through each subTabu
    data.gmcSubTab.forEach(subTab => {
        // Loop through each label in the subTab
        subTab.gmcLabelForSubTab.forEach(label => {
            // Initialize an array to hold the questions and their selected answers
            let questions = [];

            // Loop through each question in the label
            label.gmcQuestionAnswers.forEach(question => {
                // Find the selected answer by matching the `selectedAnswer` with the answer ID
                const selectedAnswerObj = question.answer.find(ans => ans._id === question.selectedAnswer);

                // If selectedAnswerObj exists, we push the question and its selected answer into the questions array
                if (selectedAnswerObj) {
                    questions.push({
                        question: question.question,
                        selectedAnswer: selectedAnswerObj.answer
                    });
                }
            });

            // Add the transformed questions array to the object with the subTab name as the key
            transformedData[subTab.subTabName] = questions;
        });
    });


    return transformedData;
}

function transformData(singleData) {
    // Initialize an object to store the transformed data
    let transformedData = {};

    // Loop through each subTab
    singleData.gmcSubTab.forEach(subTab => {
        // Loop through each label in the subTab
        subTab.gmcLabelForSubTab.forEach(label => {
            // Initialize an array to hold the questions and their selected answers
            let questions = [];

            // Loop through each question in the label
            label.gmcQuestionAnswers.forEach(question => {
                // Find the selected answer by matching the `selectedAnswer` with the answer ID
                const selectedAnswerObj = question.answer.find(ans => ans._id === question.selectedAnswer);

                // If selectedAnswerObj exists, we push the question and its selected answer into the questions array
                if (selectedAnswerObj) {
                    questions.push({
                        question: question.question,
                        selectedAnswer: selectedAnswerObj.answer
                    });
                }
            });

            // Add the transformed questions array to the object with the subTab name as the key
            transformedData[subTab.subTabName] = questions;
        });
    });

    return transformedData;
}

let keyPair = []

for (const singleData of data.gmcTemplateData) {
    keyPair.push(transformData(singleData))
}

console.log(JSON.stringify(keyPair))




