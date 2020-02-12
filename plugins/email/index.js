const log4js = require('log4js');
const logger = log4js.getLogger('email');

const nodemailer = require('nodemailer');
const rp = require('request-promise');
const config = appRequire('services/config').all();
const knex = appRequire('init/knex').knex;
const isInBlackList = appRequire('plugins/email/blackList').isInBlackList;
const cron = require('cron');
const account = appRequire('plugins/account');
const user = appRequire('plugins/user/index');
const moment = require('moment');

let emailConfig;
let transporter;

if(!config.plugins.email.type) {
  config.plugins.email.type = 'smtp';
}
if(config.plugins.email.type === 'smtp') {
  emailConfig = {
    host: config.plugins.email.host,
    port: config.plugins.email.port || 465,
    secure: (config.plugins.email.port === 465 || !config.plugins.email.port) ? true : false,
    auth: {
      user: config.plugins.email.username,
      pass: config.plugins.email.password,
    },
    tls: {
      rejectUnauthorized: !config.plugins.email.allowUnauthorizedTls,
    },
    proxy: config.plugins.email.proxy || '',
  };
  transporter = nodemailer.createTransport(emailConfig);
  if(config.plugins.email.proxy && config.plugins.email.proxy.indexOf('socks') >= 0) {
    transporter.set('proxy_socks_module', require('socks'));
  }
} else if (config.plugins.email.type === 'mailgun') {
  emailConfig = {
    baseUrl: config.plugins.email.baseUrl,
    apiKey: config.plugins.email.apiKey,
  };
  config.plugins.email.email = 'mailgun@' + emailConfig.baseUrl.split('/').slice(-1);
  const uri = 'https://api:' + emailConfig.apiKey + '@' + emailConfig.baseUrl.split('https://')[1] + '/messages';
  transporter = {};
  transporter.sendMail = (options, cb) => {
    rp({
      uri,
      method: 'POST',
      form: {
        from: options.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
      },
    }).then(success => {
      cb(null);
    }).catch(err => {
      cb(err);
    });
  };
}





const sendMail = async (to, subject, text, options = {}) => {
  if(isInBlackList(to)) {
    logger.error('Email in black list: ' + to);
    return Promise.reject('email in black list');
  }
  const send = (to, subject, text) => {
    return new Promise((resolve, reject) => {
      transporter.sendMail({
        from: `"${ config.plugins.email.name || '' }" <${ config.plugins.email.email || config.plugins.email.username }>`,
        to,
        subject,
        text,
      }, (error, info) => {
        if(error) {
          return reject(error);
        }
        return resolve(info);
      });
    });
  };
  const checkLimit = async (ip = '', session = '') => {
    let ipNumber = await knex('email')
    .where({ ip })
    .whereBetween('time', [Date.now() - 3600 * 1000, Date.now()])
    .count('time as count').then(success => success[0].count);
    let sessionNumber = await knex('email')
    .where({ session })
    .whereBetween('time', [Date.now() - 3600 * 1000, Date.now()])
    .count('time as count').then(success => success[0].count);
    if(ip === '127.0.0.1' || !ip) { ipNumber = 0; }
    if(!session) { sessionNumber = 0; }
    return ipNumber + sessionNumber;
  };
  const number = await checkLimit(options.ip, options.session);
  if(number >= 40) { return Promise.reject('send email out of limit'); }
  await send(to, subject, text);
  await knex('email').insert({
    to,
    subject,
    text,
    type: options.type,
    remark: options.remark,
    ip: options.ip,
    session: options.session,
    time: Date.now(),
  });
  return;
};

const sendCode = async (to, subject = 'subject', text, options = {}) => {
  const sendEmailTime = 10;
  try {
    const findEmail = await knex('email').select(['remark']).where({
      to,
      type: 'code',
    }).whereBetween('time', [Date.now() - sendEmailTime * 60 * 1000, Date.now()]);
    if(findEmail.length > 0) {
      return findEmail[0].remark;
    }
    const code = Math.random().toString().substr(2, 6);
    if(text.indexOf('${code}') >= 0) {
      text = text.replace(/\$\{code\}/g, '[ ' + code + ' ]');
    } else {
      text += '\n[ ' + code + ' ]';
    }
    await sendMail(to, subject, text, {
      type: 'code',
      remark: code,
      ip: options.ip,
      session: options.session,
    });
    logger.info(`[${ to }] Send code: ${ code }`);
    return code;
  } catch (err) {
    logger.error(`Send code fail: ${ err }`);
    return Promise.reject(err);
  }
};

const checkCode = async (email, code) => {
  logger.info(`[${ email }] Check code: ${ code }`);
  const sendEmailTime = 10;
  try {
    const findEmail = await knex('email').select(['remark']).where({
      to: email,
      remark: code,
      type: 'code',
    }).whereBetween('time', [Date.now() - sendEmailTime * 60 * 1000, Date.now()]);
    if(findEmail.length === 0) {
      throw new Error('Email or code not found');
    }
  } catch(err) {
    logger.error(`Check code fail: ${ err }`);
    return Promise.reject(err);
  }
};

exports.checkCode = checkCode;
exports.sendCode = sendCode;
exports.sendMail = sendMail;


console.info("init send email");
logger.info("init send email 222222");
var CronJob = cron.CronJob;
new CronJob('1 1 1 * * *', function() {
	console.log('You will see this message every second');

	const timePeriod = {
		'2': 7 * 86400 * 1000,
		'3': 30 * 86400 * 1000,
		'4': 1 * 86400 * 1000,
		'5': 3600 * 1000
	};

	const oneDay = 86400 * 1000;
	const oneDateLater = Date.now() + oneDay;
	const twoDateLater = oneDateLater + oneDay;

	account.getAccount().then(accounts => {

	  for(let account of accounts) {
		const accountData = JSON.parse(account.data);
		console.info("getAccount call");

		console.info(accountData.create + accountData.limit * timePeriod[account.type]);
		console.info( Date.now());
		const expiryDate = accountData.create + accountData.limit * timePeriod[account.type];

		if (expiryDate >= oneDateLater && expiryDate <= twoDateLater) {
			console.info('send to me：' + account.port);
			if (account.userId) {
				user.getOne(account.userId).then(u => {
				   if(u.email) {
				      const title = `[SS] User[${u.nickName}] account[${account.port}] will expiry on  ${moment(new Date(expiryDate)).format('YYYY-MM-DD')}`;
					  sendMail('498482873@qq.com', title, title);
                   }
			  });
            }

		} else if (expiryDate >= Date.now() && expiryDate <= oneDateLater) {
			console.info('send to client：' + account.port);
			if (account.userId) {
				user.getOne(account.userId).then(u => {
					if(u.email) {
                      const title = `温馨提示: 您的Shadowsocks账号将在[${moment(new Date(expiryDate)).format('YYYY-MM-DD')}]过期`;
                      const content = `您好，

    你的Shadowsocks账号的服务器将在[${moment(new Date(expiryDate)).format('YYYY-MM-DD')}]后到期。
    感谢你的支持和使用。
    
    如果你需要继续使用，我们提供付费优惠套餐：
    付费套餐一：月付20￥ - 64G。
    付费套餐二：年付130￥ - 768G。
    
    如何续费？
    登录你的账号
    选择账号页面，下方有续费功能按钮。
    点击后选择想用的套餐，会生成支付宝的支付码。
    使用支付宝扫描支付就可以了。
    暂时不支持微信支付哦。
    
    更多需求和意见反馈请联系：
    QQ: 498482873
    微信:13570405349
    
    网站链接：https://climb-ladder.site/
    
    谢谢支持！！！！！
    `;

                      sendMail(u.email, title, content);
				    }
			  });
			}
		}

      }

    });
}, null, true, 'Asia/Shanghai');

