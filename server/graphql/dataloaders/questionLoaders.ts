import Dataloader from 'dataloader';
import Question from 'models/question';

// Batchers
const batchQuestions = async (ids: number[]) => {
  const questions = await Question.query().findByIds(ids);
  return ids.map((id) => questions.find((q) => q.id === id));
};

// Loaders
export const createQuestionLoader = () => new Dataloader((ids: number[]) => batchQuestions(ids));
