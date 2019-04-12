import axios from 'axios';
import * as types from './types';
import * as voteService from '../services/voteService';

export const getQuestions = (settings, requestedIds = null) => async (dispatch) => {
  let { type, semester, specialer, tags, n, onlyNew, set } = settings;

  dispatch({ type: types.IS_FETCHING });
  let res = { data: [] };

  // Hvilke spøgsmål bedes der om?
  switch (type) {
    case 'ids':
      res = await axios.post('/api/questions/ids', {
        ids: requestedIds
      });
      break;
    case 'set':
      set = set.split('/');

      res = await axios.get(
        `/api/questions?semester=${semester}&examYear=${set[0]}&examSeason=${set[1]}`
      );
      break;
    case 'random':
    case 'specialer': {
      // Lav tomme strings til API-request
      let querySpecialer = '',
        unique = '',
        queryTags;

      // Spcialeønsker? Lav det til en streng!
      if (type === 'specialer') {
        querySpecialer = '&specialer=' + specialer.join(',');
        queryTags = '&tags=' + tags.join(',');
      }

      // Nye spørgsmål? lav det til en streng!
      if (onlyNew) unique = '&unique=t';

      // Generer den samlede query-streng
      res = await axios.get(
        `/api/questions?semester=${semester}&n=${n}${querySpecialer}${queryTags}${unique}`
      );
      break;
    }
    case 'specific': {
      res = await axios.get('/api/questions/' + settings.id);
      break;
    }
    default:
      return null;
  }

  dispatch({
    type: types.FETCH_QUESTIONS,
    payload: res.data,
    questionType: type
  });
};

export const answerQuestion = (id, answer, correct, semester, user = null) => (dispatch) => {
  let post = {
    questionId: id,
    answer: correct.correct ? 'correct' : 'wrong',
    answerNo: answer,
    semester
  };
  if (user) axios.post('/api/questions/answer', post);

  dispatch({ type: types.ANSWER_QUESTION, payload: { id, answer, correct } });
};

export const postQuestion = (post) => async (dispatch) => {
  const formData = new FormData();

  formData.append('question', post.question);
  formData.append('answer1', post.answer1);
  formData.append('answer2', post.answer2);
  formData.append('answer3', post.answer3);
  formData.append('correctAnswer', post.correctAnswer);
  formData.append('semester', post.semester);
  formData.append('examYear', post.examYear);
  formData.append('examSeason', post.examSeason);
  formData.append('specialty', post.specialty);
  if (post.image) {
    formData.append('image', post.image, post.image.name);
  }

  const res = await axios.post('/api/questions', formData);
  dispatch({ type: types.POST_QUESTION, payload: res.data });
};

export const commentQuestion = (id, comment, isPrivate) => async (dispatch) => {
  const res = await axios.put(`/api/questions/${id}/comment`, {
    comment,
    isPrivate
  });
  dispatch({
    type: types.QUESTION_COMMENT_UPDATE,
    payload: res.data
  });
};

export const deleteComment = (question_id, comment_id) => async (dispatch) => {
  const res = await axios.delete(`/api/questions/${question_id}/comment/${comment_id}`);

  dispatch({
    type: types.QUESTION_COMMENT_UPDATE,
    payload: res.data
  });
};

export const editComment = (question_id, comment_id, comment, isPrivate) => async (dispatch) => {
  const res = await axios.put(`/api/questions/${question_id}/comment/${comment_id}`, {
    comment,
    isPrivate
  });

  dispatch({
    type: types.QUESTION_COMMENT_UPDATE,
    payload: res.data
  });
};

export const questionReport = ({ type, data }) => (dispatch) => {
  axios.post('/api/questions/report', { type, data });
  dispatch({ type: types.QUESTION_REPORT });
};

export const voteSpecialty = (value, userId, id) => async (dispatch) => {
  const res = await voteService.specialtyVote(value, userId, id);
  dispatch({
    type: types.QUESTION_SPECIALTY_UPDATE,
    payload: res.data
  });
};

export const voteTags = (value, userId, id) => async (dispatch) => {
  const res = await voteService.tagVote(value, userId, id);
  dispatch({
    type: types.QUESTION_SPECIALTY_UPDATE,
    payload: res.data
  });
};
