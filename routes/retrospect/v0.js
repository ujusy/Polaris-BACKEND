const express = require('express');

const {
  Errors,
  HttpBadRequest,
  HttpInternalServerError,
} = require('../../middlewares/error');
const db = require('../../models');
const auth = require('../../middlewares/auth');
const asyncRoute = require('../../utils/asyncRoute');

const { Journey, Retrospect } = db;

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<*>}
 */
const listValues = async (req, res) => {
  const { user: currentUser } = res.locals.auth;
  const {
    year, month, weekNo,
  } = req.query;

  if (!(year && month && weekNo)) {
    throw new HttpBadRequest(Errors.JOURNEY.DATE_MISSING);
  }

  let journey;
  try {
    journey = await Journey.findAll({
      attributes: ['value1', 'value2'],
      where: {
        year,
        month,
        weekNo,
        userIdx: currentUser.idx,
      },
    });
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  const values = [];
  for (let i = 0; i < journey.length; i += 1) {
    values.push(journey[i].dataValues.value1);
    if (journey[i].dataValues.value2) {
      values.push(journey[i].dataValues.value2);
    }
  }

  const set = new Set(values);
  const response = [...set];

  return res
    .status(200)
    .json(response);
};

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<*>}
 */
const createRetrospect = async (req, res) => {
  const { user: currentUser } = res.locals.auth;

  const {
    value,
    record1,
    record2,
    record3,
    year,
    month,
    weekNo,
  } = req.body;

  if (!(year && month && weekNo)) {
    throw new HttpBadRequest(Errors.RETROSPECT.WEEK_DATA_MISSING);
  }

  if (value === undefined) {
    throw new HttpBadRequest(Errors.RETROSPECT.WEEK_DATA_MISSING);
  }

  {
    let retrospect;
    try {
      retrospect = await Retrospect.findOne({
        where: {
          year,
          month,
          weekNo,
          userIdx: currentUser.idx,
        },
      });
    } catch (err) {
      throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
    }

    if (retrospect) throw new HttpBadRequest(Errors.RETROSPECT.ALREADY_EXIST);
  }

  const valueYes = value.y;
  const valueNo = value.n;

  valueYes.forEach((value1) => {
    if (value1 && !Object.values(Journey.VALUES).includes(value1)) {
      throw new HttpBadRequest(Errors.JOURNEY.VALUES_INCORRECT);
    }
  });

  valueNo.forEach((value2) => {
    if (value2 && !Object.values(Journey.VALUES).includes(value2)) {
      throw new HttpBadRequest(Errors.JOURNEY.VALUES_INCORRECT);
    }
  });

  const {
    health, happy, challenge, moderation, emotion, need,
  } = value;

  if ((health || happy || challenge || moderation) > 5
    || (Math.sign(happy) || Math.sign(health) || Math.sign(challenge)
      || Math.sign(moderation)) === -1) {
    throw new HttpBadRequest(Errors.RETROSPECT.DEGREE_INCORRECT);
  }

  emotion.forEach((v) => {
    if (v && !Object.values(Retrospect.EMOTION).includes(v)) {
      throw new HttpBadRequest(Errors.RETROSPECT.EMOTION_INCORRECT);
    }
  });

  need.forEach((value3) => {
    if (value3 && !Object.values(Journey.VALUES).includes(value3)) {
      throw new HttpBadRequest(Errors.JOURNEY.VALUES_INCORRECT);
    }
  });

  const retrospectData = {
    value,
    record1,
    record2,
    record3,
    year,
    month,
    weekNo,
    userIdx: currentUser.idx,
  };

  let retrospect;
  try {
    retrospect = await Retrospect.create(retrospectData);
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  return res
    .status(201)
    .json(retrospect);
};

const router = express.Router();

router.get('/value', auth.authenticate({}), asyncRoute(listValues));

router.post('/', auth.authenticate({}), asyncRoute(createRetrospect));

module.exports = {
  router,
  listValues,
  createRetrospect,
};