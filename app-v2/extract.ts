import fs from 'fs';
import { SEED_INTERVIEW_QUESTIONS, SEED_INTERVIEW_CATEGORIES } from './src/storage/data.tsx';

const content = {
  track: 'interview',
  categories: SEED_INTERVIEW_CATEGORIES,
  items: SEED_INTERVIEW_QUESTIONS.map(q => ({
    id: q.id,
    categoryId: q.categoryId,
    prompt: q.question,
    tags: q.tags || []
  }))
};

fs.mkdirSync('./src/content', { recursive: true });
fs.writeFileSync('./src/content/interview.json', JSON.stringify(content, null, 2));
console.log('Done extracting interview.json');
