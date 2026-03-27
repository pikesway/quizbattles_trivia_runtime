import { supabase } from '../../lib/supabase';

interface QuestionSeed {
  question_text: string;
  explanation: string;
  topic: string;
  tags: string[];
  difficulty: number;
  answers: {
    answer_text: string;
    is_correct: boolean;
    display_order: number;
  }[];
}

const sampleQuestions: QuestionSeed[] = [
  {
    question_text: 'What is the capital of France?',
    explanation: 'Paris has been the capital of France since the 12th century and is known for its art, fashion, and culture.',
    topic: 'geography',
    tags: ['europe', 'capitals', 'easy'],
    difficulty: 1,
    answers: [
      { answer_text: 'London', is_correct: false, display_order: 1 },
      { answer_text: 'Paris', is_correct: true, display_order: 2 },
      { answer_text: 'Berlin', is_correct: false, display_order: 3 },
      { answer_text: 'Madrid', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'What is 2 + 2?',
    explanation: 'Basic addition: 2 plus 2 equals 4.',
    topic: 'math',
    tags: ['arithmetic', 'easy', 'basic'],
    difficulty: 1,
    answers: [
      { answer_text: '3', is_correct: false, display_order: 1 },
      { answer_text: '4', is_correct: true, display_order: 2 },
      { answer_text: '5', is_correct: false, display_order: 3 },
      { answer_text: '6', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'Which planet is known as the Red Planet?',
    explanation: 'Mars appears red due to iron oxide (rust) on its surface, giving it a distinctive reddish appearance.',
    topic: 'science',
    tags: ['astronomy', 'planets', 'space'],
    difficulty: 2,
    answers: [
      { answer_text: 'Venus', is_correct: false, display_order: 1 },
      { answer_text: 'Mars', is_correct: true, display_order: 2 },
      { answer_text: 'Jupiter', is_correct: false, display_order: 3 },
      { answer_text: 'Saturn', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'Who wrote "Romeo and Juliet"?',
    explanation: 'William Shakespeare wrote Romeo and Juliet around 1594-1596. It is one of his most famous tragedies.',
    topic: 'literature',
    tags: ['shakespeare', 'classics', 'drama'],
    difficulty: 2,
    answers: [
      { answer_text: 'Charles Dickens', is_correct: false, display_order: 1 },
      { answer_text: 'William Shakespeare', is_correct: true, display_order: 2 },
      { answer_text: 'Jane Austen', is_correct: false, display_order: 3 },
      { answer_text: 'Mark Twain', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'What is the largest ocean on Earth?',
    explanation: 'The Pacific Ocean covers approximately 165 million square kilometers, making it the largest ocean.',
    topic: 'geography',
    tags: ['oceans', 'earth', 'nature'],
    difficulty: 2,
    answers: [
      { answer_text: 'Atlantic Ocean', is_correct: false, display_order: 1 },
      { answer_text: 'Indian Ocean', is_correct: false, display_order: 2 },
      { answer_text: 'Pacific Ocean', is_correct: true, display_order: 3 },
      { answer_text: 'Arctic Ocean', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'What is the chemical symbol for gold?',
    explanation: 'Gold\'s chemical symbol is Au, derived from the Latin word "aurum" meaning gold.',
    topic: 'science',
    tags: ['chemistry', 'elements', 'periodic-table'],
    difficulty: 3,
    answers: [
      { answer_text: 'Go', is_correct: false, display_order: 1 },
      { answer_text: 'Gd', is_correct: false, display_order: 2 },
      { answer_text: 'Au', is_correct: true, display_order: 3 },
      { answer_text: 'Ag', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'In which year did World War II end?',
    explanation: 'World War II ended in 1945 with the surrender of Germany in May and Japan in September.',
    topic: 'history',
    tags: ['wwii', '20th-century', 'war'],
    difficulty: 2,
    answers: [
      { answer_text: '1943', is_correct: false, display_order: 1 },
      { answer_text: '1944', is_correct: false, display_order: 2 },
      { answer_text: '1945', is_correct: true, display_order: 3 },
      { answer_text: '1946', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'What is the smallest prime number?',
    explanation: 'The number 2 is the smallest and only even prime number. A prime number is only divisible by 1 and itself.',
    topic: 'math',
    tags: ['numbers', 'prime', 'mathematics'],
    difficulty: 2,
    answers: [
      { answer_text: '0', is_correct: false, display_order: 1 },
      { answer_text: '1', is_correct: false, display_order: 2 },
      { answer_text: '2', is_correct: true, display_order: 3 },
      { answer_text: '3', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'Which country is home to the kangaroo?',
    explanation: 'Kangaroos are native to Australia and are one of the country\'s most iconic animals.',
    topic: 'geography',
    tags: ['animals', 'australia', 'wildlife'],
    difficulty: 1,
    answers: [
      { answer_text: 'New Zealand', is_correct: false, display_order: 1 },
      { answer_text: 'Australia', is_correct: true, display_order: 2 },
      { answer_text: 'South Africa', is_correct: false, display_order: 3 },
      { answer_text: 'Brazil', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'What programming language is known for its use in web browsers?',
    explanation: 'JavaScript is the primary programming language used to create interactive effects in web browsers.',
    topic: 'technology',
    tags: ['programming', 'web', 'javascript'],
    difficulty: 2,
    answers: [
      { answer_text: 'Python', is_correct: false, display_order: 1 },
      { answer_text: 'Java', is_correct: false, display_order: 2 },
      { answer_text: 'JavaScript', is_correct: true, display_order: 3 },
      { answer_text: 'C++', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'What is the speed of light in vacuum?',
    explanation: 'The speed of light in vacuum is approximately 299,792,458 meters per second, commonly rounded to 300,000 km/s.',
    topic: 'science',
    tags: ['physics', 'light', 'constants'],
    difficulty: 3,
    answers: [
      { answer_text: '200,000 km/s', is_correct: false, display_order: 1 },
      { answer_text: '300,000 km/s', is_correct: true, display_order: 2 },
      { answer_text: '400,000 km/s', is_correct: false, display_order: 3 },
      { answer_text: '500,000 km/s', is_correct: false, display_order: 4 },
    ],
  },
  {
    question_text: 'Who painted the Mona Lisa?',
    explanation: 'Leonardo da Vinci painted the Mona Lisa in the early 16th century. It is one of the most famous paintings in the world.',
    topic: 'art',
    tags: ['renaissance', 'painting', 'history'],
    difficulty: 2,
    answers: [
      { answer_text: 'Michelangelo', is_correct: false, display_order: 1 },
      { answer_text: 'Leonardo da Vinci', is_correct: true, display_order: 2 },
      { answer_text: 'Raphael', is_correct: false, display_order: 3 },
      { answer_text: 'Van Gogh', is_correct: false, display_order: 4 },
    ],
  },
];

export async function seedQuestions(): Promise<void> {
  console.log('Seeding questions...');

  for (const questionSeed of sampleQuestions) {
    const { answers, ...questionData } = questionSeed;

    const { data: question, error: questionError } = await supabase
      .from('trivia_questions')
      .insert(questionData)
      .select()
      .single();

    if (questionError) {
      console.error('Error inserting question:', questionError);
      continue;
    }

    console.log(`Created question: ${question.question_text}`);

    const answersToInsert = answers.map(answer => ({
      ...answer,
      question_id: question.id,
    }));

    const { error: answersError } = await supabase
      .from('trivia_answers')
      .insert(answersToInsert);

    if (answersError) {
      console.error('Error inserting answers:', answersError);
    }
  }

  console.log('Seeding complete!');
}

seedQuestions().catch(console.error);
