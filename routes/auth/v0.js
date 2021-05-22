const env = process.env.NODE_ENV;

const express = require('express');
const moment = require('moment');
const ms = require('ms');

const authConfig = require('../../config/auth')[env];
const auth = require('../../middlewares/auth');
const {
  Errors,
  HttpBadRequest,
  HttpInternalServerError,
} = require('../../middlewares/error');
const db = require('../../models');
const asyncRoute = require('../../utils/asyncRoute');

const { RefreshToken, User } = db;

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<*>}
 */
const emailLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email) throw new HttpBadRequest(Errors.USER.EMAIL_MISSING);
  if (!password) throw new HttpBadRequest(Errors.USER.PASSWORD_MISSING);

  let user;
  try {
    user = await User.findOne({
      where: {
        email,
      },
    });
  } catch (e) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, e);
  }

  if (user === null || !user.validatePasswordHash(password)) {
    throw new HttpBadRequest(Errors.AUTH.LOGIN_INFO_INCORRECT);
  }

  let refreshToken;
  try {
    const queryData = {
      refreshToken: auth.tokens.generateRefreshToken(),
      userIdx: user.idx,
      expiresAt: moment().add(ms(authConfig.refreshTokenExpire), 'milliseconds')
        .format('YYYY-MM-DD hh:mm:ss'),
    };
    refreshToken = await RefreshToken.create(queryData);
  } catch (e) {
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, e);
  }

  let accessToken;
  try {
    const accessTokenData = {
      userIdx: user.idx,
      refreshTokenIdx: refreshToken.idx,
    };
    accessToken = auth.tokens.generateAccessToken(accessTokenData);
  } catch (e) {
    await refreshToken.destroy();
    throw new HttpInternalServerError(Errors.SERVER.UNEXPECTED_ERROR, e);
  }

  const resBody = {
    accessToken,
    refreshToken: refreshToken.refreshToken,
  };

  return res
    .status(201)
    .json(resBody);
};

const router = express.Router();

router.post('/', asyncRoute(emailLogin));

module.exports = {
  router,
  emailLogin,
};
