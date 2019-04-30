import express from "express";
import { ValidationError, NotFoundError, transaction } from "objection";
import { permit } from "../middleware/permission";
import createResponse from "./_swaggerComponents";
import Question from "../models/question";
import QuestionBookmark from "../models/question_bookmark";
import QuestionUserAnswer from "../models/question_user_answer";
import QuestionSpecialtyVote from "../models/question_specialty_vote";
import QuestionTagVote from "../models/question_tag_vote";

import {
  errorHandler,
  NotAuthorized,
  BadRequest
} from "../middleware/errorHandling";

const router = express.Router();

/**
 * @swagger
 * /questions:
 *   get:
 *     summary: Get multiple questions
 *     description: >
 *       Returns a list of questions.
 *       Only accessible to admins if requesting more than 300 questions without
 *       ids.<br><br>
 *       If ids are provided, all other parameters are ignored. Otherwise,
 *       query parameters are combined and only questions fulfulling all
 *       requirements are selected (i.e. an *inner join*\/*andWhere* is performed
 *       on each parameter).
 *     tags:
 *       - Questions
 *     parameters:
 *       - in: query
 *         name: ids
 *         schema:
 *           type: string
 *           description: A comma separated list of ids to fetch.
 *       - in: query
 *         name: n
 *         schema:
 *           type: integer
 *           description: The number of questions to return. For non-admins, 300 is the max.
 *           example: 80
 *       - in: query
 *         name: onlyNew
 *         schema:
 *           type: boolean
 *           description: >
 *             If the `req.user` object is present, only selects questions the
 *             user has *not* previously answered.
 *           example: true
 *       - in: query
 *         name: semesters
 *         schema:
 *           type: string
 *           description: A comma separated list of `semester.ids`s to draw questions from.
 *           example: 1,2
 *       - in: query
 *         name: specialties
 *         schema:
 *           type: string
 *           description: >
 *             A comma separated list of `specialty.id`s to draw questions from.
 *           example:
 *             1,2
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *           description: A comma separated list of `tag.id`s to draw questions from.
 *           example: 1,2
 *     responses:
 *       200:
 *         description: List of questions.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Questions"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/", async (req, res) => {
  let user = req.user || {};
  let { ids, n, semesters, onlyNew, specialties, tags } = req.query;
  try {
    // If user is not allowed to query >300 questions, we throw an error
    if (
      !ids &&
      (!n || n > 300) &&
      ["admin", "creator"].indexOf(user.role) === -1
    ) {
      throw new NotAuthorized({
        message: `You requested too many questions. The limit for non-admins is 300 (you requested ${req
          .query.n || "all"}).`,
        data: {}
      });
    }

    let query = Question.query()
      .select("question.*", "semester.id as semester")
      .joinRelation("semester")
      .eager(Question.defaultEager)
      .orderByRaw("rand()");

    // If requesting ids, get them
    if (ids) {
      query = query.whereIn(
        "Question.id",
        ids.split(",").map(id => Number(id))
      );
    } else {
      // Otherwise, filter by results
      if (semesters) query = query.whereIn("semester.id", semesters.split(","));

      if (n) query = query.limit(n);

      if (specialties) {
        query = query.modify("filterOnMetadata", {
          type: "specialties",
          ids: specialties.split(",")
        });
      }

      if (tags) {
        query = query.modify("filterOnMetadata", {
          type: "tags",
          ids: tags.split(",")
        });
      }

      if (req.user && onlyNew) {
        query = query.whereNotIn(
          "question.id",
          QuestionUserAnswer.query()
            .where({ userId: req.user.id })
            .distinct("questionId")
        );
      }
    }
    if (req.user) {
      query = query.mergeEager("privateComments(own)", {
        userId: req.user.id
      });
      query = query.mergeEager("userSpecialtyVotes(own)", {
        userId: req.user.id
      });
      query = query.mergeEager("userTagVotes(own)", {
        userId: req.user.id
      });
    }
    let questions = await query;

    res.status(200).json(questions);
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions:
 *   post:
 *     summary: Post a new question
 *     description: Inserts a new question into the database. Requires admin permissions.
 *     tags:
 *       - Questions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *               answer1:
 *                 type: string
 *               answer2:
 *                 type: string
 *               answer3:
 *                 type: string
 *               correctAnswers:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Most likely an array of length 1 (e.g. `[1]`) but can also be longer (e.g. `[1,3]`)
 *               examSetId:
 *                 type: integer
 *                 description: References an exam set
 *               examSetQno:
 *                 type: integer
 *                 description: The number of the question in the set
 *     responses:
 *       200:
 *         description: The created question.
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Question"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/", permit({ roles: ["admin"] }), async (req, res) => {
  try {
    let questionToInsert = req.body;

    questionToInsert.correctAnswers = questionToInsert.correctAnswers.map(
      answer => ({ answer })
    );

    const newQuestion = await transaction(Question.knex(), async trx => {
      const newQuestion = await Question.query(trx)
        .insertGraphAndFetch(questionToInsert)
        .eager("examSet");
      return newQuestion;
    });

    res.status(200).json(newQuestion);
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions/search:
 *   post:
 *     summary: Search for a question
 *     description: >
 *       Performs a MySQL full text search on question text and answers.
 *       For references on MySQL full text searches, see e.g.
 *       [the MySQL docs](https://dev.mysql.com/doc/refman/8.0/en/fulltext-boolean.html).
 *     tags:
 *       - Questions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               searchString:
 *                 type: string
 *                 example: 'appendicit'
 *     responses:
 *       200:
 *         description: The matched questions.
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Questions"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/search", async (req, res) => {
  try {
    let { searchString } = req.body;

    const questions = await Question.query()
      .whereRaw(
        "MATCH (text, answer1, answer2, answer3) AGAINST (? IN BOOLEAN MODE)",
        searchString
      )
      .eager(Question.defaultEager);

    res.status(200).json(questions);
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions/:id:
 *   get:
 *     summary: Fetch question by id
 *     description: >
 *       Returns the specific question requested. If the request includes `req.user`,
 *       also includes the private comments by the user.
 *     tags:
 *       - Questions
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: The id to get
 *     responses:
 *       200:
 *         description: The question
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Question"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.get("/:id", async (req, res) => {
  let { id } = req.params;

  let query = Question.query()
    .findById(id)
    .eager(Question.defaultEager);

  if (req.user) {
    query = query.mergeEager("privateComments(own)", { userId: req.user.id });
    query = query.mergeEager("userSpecialtyVotes(own)", {
      userId: req.user.id
    });
    query = query.mergeEager("userTagVotes(own)", {
      userId: req.user.id
    });
  }

  try {
    let question = await query;

    if (!question) throw new NotFoundError();

    res.status(200).json(question);
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions/:id:
 *   patch:
 *     summary: Patch an existing question
 *     description: >
 *       Patches an existing question. Response does not include private comments.
 *       Requires editor or higher permissions.
 *     tags:
 *       - Questions
 *     requestBody:
 *       description: Any of the following keys can be included.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *               answer1:
 *                 type: string
 *               answer2:
 *                 type: string
 *               answer3:
 *                 type: string
 *               correctAnswers:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Most likely an array of length 1 (e.g. `[1]`) but can also be longer (e.g. `[1,3]`)
 *               examSetId:
 *                 type: integer
 *                 description: References an exam set
 *               examSetQno:
 *                 type: integer
 *                 description: The number of the question in the set
 *     responses:
 *       200:
 *         description: The patched question
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Question"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.patch(
  "/:id",
  permit({ roles: ["editor", "admin"] }),
  async (req, res) => {
    try {
      // Hvis der ikke er nogle data med i req.body smider vi en fejl
      if (Object.keys(req.body).length === 0) {
        throw new ValidationError({
          type: "ModelValidation",
          message: "No values to patch",
          data: {}
        });
      }

      let questionToPatch = req.body;
      questionToPatch.id = Number(req.params.id);

      if (questionToPatch.correctAnswers)
        questionToPatch.correctAnswers = questionToPatch.correctAnswers.map(
          answer => ({ answer })
        );

      const question = await transaction(Question.knex(), async trx => {
        const question = Question.query(trx)
          .upsertGraphAndFetch(questionToPatch)
          .eager(Question.defaultEager);
        return question;
      });

      if (!question) throw new NotFoundError();
      res.status(200).json(question);
    } catch (err) {
      errorHandler(err, res);
    }
  }
);

/**
 * @swagger
 * /questions/:id:
 *   delete:
 *     summary: Delete a question
 *     description: Deletes a question. Requires admin permissions.
 *     tags:
 *       - Questions
 *     responses:
 *       200:
 *         description: Succesful delete
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Success"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.delete("/:id", permit({ roles: ["admin"] }), async (req, res) => {
  let { id } = req.params;

  try {
    const deleted = await Question.query().deleteById(id);
    if (deleted > 0) {
      res.status(200).json({
        type: "deleteQuestion",
        message: `Succesfully deleted ${deleted} question`
      });
    } else {
      throw new NotFoundError();
    }
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions/:id/vote:
 *   put:
 *     summary: Vote for a specialty or tag
 *     description: >
 *       Saves specialty and tag votes to the database, related to a questionId.
 *       If supplying an empty array, the user's votes of the type are reset.
 *       Requires a logged-in user.
 *     tags:
 *       - Questions
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *           description: A question id to save the votes for
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               specialtyVotes:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: An array of specialty ids.
 *                 example: [1,3]
 *               tagVotes:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: An array of tag ids.
 *                 example: [2,4]
 *     responses:
 *       200:
 *         description: The updated question
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Question"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.put("/:id/vote", permit(), async (req, res) => {
  try {
    let questionId = Number(req.params.id);
    let { specialtyVotes, tagVotes } = req.body;

    if (!questionId)
      throw new BadRequest({ message: "You must provide a question id." });

    if (!specialtyVotes && !tagVotes)
      throw new BadRequest({
        message: "You must provide either specialty votes or tag votes."
      });

    let userId = req.user.id;

    const updatedQuestion = await transaction(Question.knex(), async trx => {
      if (specialtyVotes) {
        if (!Array.isArray(specialtyVotes))
          throw new BadRequest({
            message: "specialtyVotes must be an array of integers"
          });

        await QuestionSpecialtyVote.query(trx)
          .where({ questionId, userId: userId })
          .delete();

        specialtyVotes = specialtyVotes.map(vote => ({
          questionId,
          userId,
          specialtyId: vote
        }));

        await QuestionSpecialtyVote.query(trx).insertGraph(specialtyVotes);
      }

      if (tagVotes) {
        if (!Array.isArray(tagVotes))
          throw new BadRequest({
            message: "tagVotes must be an array of integers"
          });

        await QuestionTagVote.query(trx)
          .where({ questionId, userId: userId })
          .delete();

        tagVotes = tagVotes.map(vote => ({
          questionId,
          userId,
          tagId: vote
        }));

        await QuestionTagVote.query(trx).insertGraph(tagVotes);
      }

      const updatedQuestion = await Question.query(trx)
        .findById(questionId)
        .eager(Question.defaultEager)
        .mergeEager("privateComments(own)", { userId: userId })
        .mergeEager("userSpecialtyVotes(own, joinSpecialty)", {
          userId: userId
        })
        .mergeEager("userTagVotes(own, joinTag)", { userId: userId });
      return updatedQuestion;
    });
    res.status(200).json(updatedQuestion);
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions/:id/answer:
 *   post:
 *     summary: Save an answer
 *     description: Saves an answer to the database
 *     tags:
 *       - Questions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               answer:
 *                 type: integer
 *                 description: The user's answer (e.g. `1` || `2` || `3`)
 *                 example: 1
 *     responses:
 *       200:
 *         description: >
 *           Success message. `data` property includes the user's answer and the
 *           base question model including correct answers.<br><br>
 *
 *           `response.type = "QuestionAnswerSucces"`
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Success"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/:id/answer", async (req, res) => {
  let questionId = Number(req.params.id);
  let { answer } = req.body;

  let userId = (req.user || {}).id || null;

  try {
    await QuestionUserAnswer.query().insert({
      questionId,
      userId,
      answer
    });

    const question = await Question.query()
      .findById(questionId)
      .eager("correctAnswers");

    res.status(200).send(
      createResponse("QuestionAnswerSuccess", "Succesfully saved answer", {
        answer,
        question
      })
    );
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions/:id/bookmark:
 *   post:
 *     summary: Bookmark question
 *     description: >
 *       Save the question for later revisiting, i.e. bookmarking.
 *
 *       Although it is a `POST`, no requestBody is required.
 *
 *       Requires the user to be logged in.
 *     tags:
 *       - Questions
 *     responses:
 *       200:
 *         description: >
 *           Success message.
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Success"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.post("/:id/bookmark", permit(), async (req, res) => {
  let questionId = Number(req.params.id);
  try {
    await QuestionBookmark.query().insert({ userId: req.user.id, questionId });

    res.status(200).json(createResponse("QuestionBookmarkSuccess"));
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * /questions/:id/bookmark:
 *   delete:
 *     summary: Delete a bookmark
 *     description: Deletes a bookmark. Requires the user to be logged in.
 *     tags:
 *       - Questions
 *     responses:
 *       200:
 *         description: >
 *           Success message.
 *         content:
 *            application/json:
 *              schema:
 *                $ref: "#/components/schemas/Success"
 *       default:
 *         description: unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Error"
 */
router.delete("/:id/bookmark", permit(), async (req, res) => {
  let questionId = Number(req.params.id);
  try {
    const deleted = await QuestionBookmark.query()
      .where({ userId: req.user.id, questionId })
      .delete();

    if (deleted === 0) {
      throw new NotFoundError({ message: "No bookmark to delete" });
    }

    res.status(200).json(createResponse("QuestionBookmarkDeleteSuccess"));
  } catch (err) {
    errorHandler(err, res);
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *      Question:
 *        required:
 *          - id
 *          - text
 *          - answer1
 *          - answer2
 *          - answer3
 *          - correctAnswers
 *          - examSetId
 *          - examSet
 *          - examSetQno
 *          - specialties
 *          - tags
 *        properties:
 *          id:
 *            type: integer
 *          text:
 *            type: string
 *          image:
 *            type: string
 *            nullable: true
 *          answer1:
 *            type: string
 *          answer2:
 *            type: string
 *          answer3:
 *            type: string
 *          correctAnswers:
 *            type: array
 *            items:
 *              type: integer
 *            description: Most likely an array of length 1 (e.g. `[1]`) but can also be longer (e.g. `[1,3]`)
 *          examSetId:
 *            type: integer
 *            description: References an exam set
 *          examSet:
 *              $ref: "#/components/schemas/ExamSet"
 *          examSetQno:
 *            type: integer
 *            description: The number of the question in the set
 *          specialties:
 *            $ref: "#/components/schemas/Specialties"
 *          tags:
 *            $ref: "#/components/schemas/Tags"
 *          publicComments:
 *            $ref: "#/components/schemas/Comments"
 *          privateComments:
 *            description: Included if the user is logged in.
 *            allOf:
 *              - $ref: "#/components/schemas/Comments"
 *          userSpecialtyVotes:
 *            description: Included if the user is logged in.
 *            allOf:
 *              - $ref: "#/components/schemas/UserSpecialtyVotes"
 *          userTagVotes:
 *            description: Included if the user is logged in.
 *            allOf:
 *              - $ref: "#/components/schemas/UserTagVotes"
 *      Questions:
 *        type: array
 *        items:
 *          $ref: "#/components/schemas/Question"
 */

export default router;