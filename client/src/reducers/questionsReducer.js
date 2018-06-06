import * as types from '../actions/types';
import _ from 'lodash';

export default function(state = [], action) {
	switch (action.type) {
		case types.FETCH_QUESTIONS:
			return action.payload || false;
		case types.ANSWER_QUESTION:
			let newState = [...state];

			let q = _.findIndex(newState, { _id: action.payload.id });
			newState[q].answer = action.payload.answer;
			return newState;

		default:
			return state;
	}
}
