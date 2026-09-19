export const exercises = {
  MULTIPLE_CHOICE: {
    question: 'Which is a variable name?',
    options: ['count', '42'],
    correctAnswer: 'count',
    explanation: 'A name identifies a variable.',
  },
  FILL_IN_BLANK: {
    question: 'Complete: x = [[value]]',
    blanks: [{ id: 'value', correctAnswer: '1' }],
    explanation: 'Assign one to x.',
  },
  MATCHING: {
    question: 'Match each term.',
    leftOptions: ['one', 'two'],
    rightOptions: ['1', '2'],
    correctAnswer: [
      { left: 'one', right: '1' },
      { left: 'two', right: '2' },
    ],
    explanation: 'Match the number words.',
  },
  TRUE_FALSE: {
    question: 'One plus one equals two.',
    correctAnswer: true,
    explanation: '1 + 1 = 2.',
  },
  CODE_PREDICT: {
    question: 'What does print(1 + 1) output in Python?',
    correctAnswer: '2',
    explanation: 'The sum is printed.',
  },
  TRANSLATE: {
    question: 'Translate Spanish hola into English.',
    correctAnswer: 'hello',
    explanation: 'Hola is a greeting.',
  },
  SHORT_ANSWER: {
    question: 'What is 1 + 1?',
    correctAnswer: '2',
    explanation: 'Adding one and one gives two.',
  },
};
export function lessonFixture(types = ['MULTIPLE_CHOICE', 'SHORT_ANSWER']) {
  return {
    title: 'A first concept',
    description: 'Practice one basic concept.',
    parts: Array.from({ length: 5 }, (_, i) => {
      const type = types[i % types.length];
      return {
        order: i + 1,
        type,
        promptContent: structuredClone(exercises[type]),
      };
    }),
  };
}
export function responseFixture(lesson = lessonFixture()) {
  return {
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(lesson) }],
      },
    ],
  };
}
