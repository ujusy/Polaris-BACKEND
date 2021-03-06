/* eslint-disable no-param-reassign,no-restricted-syntax */

const express = require('express');
const moment = require('moment');
const asyncRoute = require('../../utils/asyncRoute');
const db = require('../../models');
const auth = require('../../middlewares/auth');
const { getWeekOfMonth } = require('../../utils/weekCalculation');
const { getRandomValue } = require('../../utils/random');
const {
  Errors,
  HttpBadRequest,
  HttpInternalServerError,
  HttpNotFound,
} = require('../../middlewares/error');

const { Journey, ToDo } = db;

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<*>}
 */
const createToDo = async (req, res) => {
  const { user: currentUser } = res.locals.auth;

  const {
    title, date, isTop,
  } = req.body;
  let { journeyIdx } = req.body;

  if (!date) throw new HttpBadRequest(Errors.TODO.DATE_MISSING);
  if (!title) throw new HttpBadRequest(Errors.TODO.TITLE_MISSING);
  if (isTop.isNull) throw new HttpBadRequest(Errors.TODO.IS_TOP_MISSING);

  const weekInfo = await getWeekOfMonth(new Date(date));

  const transaction = await db.sequelize.transaction();

  if (journeyIdx) {
    let journey;
    try {
      journey = await Journey.findByPk(journeyIdx, {
        attributes: ['idx', 'year', 'month', 'weekNo'],
      });
    } catch (err) {
      throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
    }

    if (!journey) throw new HttpNotFound(Errors.JOURNEY.NOT_FOUND);

    if (
      journey.year !== weekInfo.year
      || journey.month !== weekInfo.month
      || journey.weekNo !== weekInfo.weekNo
    ) {
      throw new HttpBadRequest(Errors.TODO.INCORRECT_WEEK_NO);
    }
  } else {
    // 해당 주차의 기본 여정 여부 체크
    let defaultJourney;
    try {
      defaultJourney = await Journey.findOne({
        where: {
          title: 'default',
          userIdx: currentUser.idx,
          year: weekInfo.year,
          month: weekInfo.month,
          weekNo: weekInfo.weekNo,
        },
      });
    } catch (err) {
      throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
    }

    // 해당 주차의 기본 여정이 없다면 생성
    if (!defaultJourney) {
      const value1 = await getRandomValue(Object.values(Journey.VALUES), null);
      const value2 = await getRandomValue(Object.values(Journey.VALUES), value1);

      const defaultJourneyData = {
        title: 'default',
        value1,
        value2,
        year: weekInfo.year,
        month: weekInfo.month,
        weekNo: weekInfo.weekNo,
        date,
        userIdx: currentUser.idx,
      };

      try {
        defaultJourney = await Journey.create(defaultJourneyData, { transaction });
      } catch (err) {
        throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
      }
    }
    journeyIdx = defaultJourney.idx;
  }

  const toDoData = {
    title,
    date,
    isTop,
    journeyIdx,
    userIdx: currentUser.idx,
  };

  let todo;
  try {
    todo = await ToDo.create(toDoData, { transaction });
    await transaction.commit();
  } catch (err) {
    await transaction?.rollback();
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  return res.status(201).json(todo);
};

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
const updateToDo = async (req, res) => {
  const { user: currentUser } = res.locals.auth;

  const { toDoIdx } = req.params;

  const {
    title,
    date,
    journeyIdx,
    isTop,
    isDone,
  } = req.body;

  let toDo;

  try {
    toDo = await ToDo.findOne({
      where: {
        idx: toDoIdx,
        userIdx: currentUser.idx,
      },
    });
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  if (!toDo) throw new HttpNotFound(Errors.TODO.NOT_FOUND);

  if (title) toDo.title = title;
  if (isTop !== undefined) toDo.isTop = isTop;

  if (journeyIdx && date) {
    const weekInfo = await getWeekOfMonth(new Date(date));

    let journey;
    try {
      journey = await Journey.findByPk(journeyIdx, {
        attributes: ['idx', 'year', 'month', 'weekNo'],
      });
    } catch (err) {
      throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
    }

    if (!journey) throw new HttpNotFound(Errors.JOURNEY.NOT_FOUND);

    if (
      journey.year !== weekInfo.year
      || journey.month !== weekInfo.month
      || journey.weekNo !== weekInfo.weekNo
    ) {
      throw new HttpBadRequest(Errors.TODO.INCORRECT_WEEK_NO);
    }

    toDo.journeyIdx = journeyIdx;
    toDo.date = date;
  }

  if (isDone === true) {
    toDo.isDone = moment();
  } else if (isDone === false) {
    toDo.isDone = null;
  }

  try {
    await toDo.save();
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  return res.status(200).json(toDo);
};

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<*>}
 */
const listToDoByJourneys = async (req, res) => {
  const { user: currentUser } = res.locals.auth;

  const { year, month, weekNo } = req.query;

  const where = {};
  if (year && month && weekNo) {
    where.year = year;
    where.month = month;
    where.weekNo = weekNo;
  }

  where.userIdx = currentUser.idx;

  let listToDoByJourney;
  try {
    listToDoByJourney = await Journey.findAll({
      attributes: ['idx', 'title', 'value1', 'value2', 'year', 'month', 'weekNo', 'userIdx'],
      where,
      order: [
        [ToDo, 'isTop', 'DESC'],
        [ToDo, 'date', 'ASC'],
      ],
      include: [{
        model: ToDo,
        attributes: ['idx', 'title', 'isTop', 'isDone', 'date', 'createdAt'],
      }],
    });
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  listToDoByJourney.forEach((journey) => {
    journey.toDos.forEach((toDo) => {
      const utcDate = new Date(toDo.dataValues.date).toUTCString();
      // eslint-disable-next-line no-param-reassign
      toDo.dataValues.date = moment(utcDate).format('YYYY-MM-DD');
    });
  });

  return res.status(200).json(listToDoByJourney);
};

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<*>}
 */
const listToDoByDate = async (req, res) => {
  const { user: currentUser } = res.locals.auth;

  const { year, month, weekNo } = req.query;

  const where = {};
  if (year && month && weekNo) {
    where.year = year;
    where.month = month;
    where.weekNo = weekNo;
  }

  where.userIdx = currentUser.idx;

  let listToDoData;
  try {
    listToDoData = await ToDo.findAll({
      attributes: ['idx', 'title', 'isTop', 'isDone', 'date', 'createdAt'],
      order: [
        ['isTop', 'DESC'],
        ['date', 'ASC'],
      ],
      where: {
        userIdx: currentUser.idx,
      },
      include: [{
        model: Journey,
        attributes: ['idx', 'year', 'month', 'weekNo', 'title', 'userIdx'],
        required: false,
        where,
      }],
    });
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }
  const toDoList = [];
  listToDoData.forEach((toDo) => {
    const utcDate = new Date(toDo.dataValues.date).toUTCString();
    toDo.dataValues.date = moment(utcDate).format('YYYY-MM-DD');
    toDoList.push(toDo.dataValues);
  });

  const resBody = {};
  toDoList.forEach((toDo) => {
    if (!Array.isArray(resBody[toDo.date])) {
      resBody[toDo.date] = [];
    }
    resBody[toDo.date].push(toDo);
  });

  const resBody2 = {
    data: [],
  };

  for (const key of Object.keys(resBody)) {
    resBody2.data.push({
      day: key,
      todoList: resBody[key],
    });
  }

  return res.status(200).json(resBody2);
};

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<*>}
 */
const deleteToDo = async (req, res) => {
  const { user: currentUser } = res.locals.auth;

  const { toDoIdx } = req.params;

  let toDo;
  try {
    toDo = await ToDo.findOne({
      where: {
        userIdx: currentUser.idx,
        idx: toDoIdx,
      },
    });
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  if (!toDo) throw new HttpNotFound(Errors.TODO.NOT_FOUND);

  try {
    await toDo.destroy();
  } catch (err) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, err);
  }

  return res.status(200).json({
    isSuccess: true,
  });
};

const router = express.Router();

router.post('/', auth.authenticate({}), asyncRoute(createToDo));

router.patch('/:toDoIdx', auth.authenticate({}), asyncRoute(updateToDo));

router.get('/journey', auth.authenticate({}), asyncRoute(listToDoByJourneys));

router.get('/date', auth.authenticate({}), asyncRoute(listToDoByDate));

router.delete('/:toDoIdx', auth.authenticate({}), asyncRoute(deleteToDo));

module.exports = {
  router, createToDo, updateToDo, listToDoByJourneys, listToDoByDate, deleteToDo,
};
