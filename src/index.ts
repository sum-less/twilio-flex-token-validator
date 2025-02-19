import * as https from 'https';

declare namespace Twilio {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  class Response {
    public appendHeader(key: string, value: string): void;

    public setStatusCode(code: number): void;

    public setBody(body: string): void;
  }
}

export interface Context {
  ACCOUNT_SID: string;
  AUTH_TOKEN: string;
}

export interface Event {
  Token: string;
  TokenResult?: object;
}

export type Callback = (error: any, response: Twilio.Response) => void;
export type HandlerFn = (context: Context, event: Event, callback: Callback) => void;

/**
 * Validates that the Token is valid
 *
 * @param token        the token to validate
 * @param accountSid   the accountSid
 * @param authToken    the authToken
 */
export const validator = async (token: string, accountSid: string, authToken: string): Promise<object> => {
  return new Promise((resolve, reject) => {
    if (!token) {
      reject('Unauthorized: Token was not provided');
      return;
    }

    if (!accountSid || !authToken) {
      reject('Unauthorized: AccountSid or AuthToken was not provided');
      return;
    }
    
    // detects if authToken is an object with attributes key and secret to assign hasAPIKey a boolean 
    const hasAPIKey = !!apikeys ? (!!apikeys.key ? (!!apikeys.secret ? true : false ) : false) : false;

    // changed to include API keys if hasAPIKey is true
    const authorization = hasAPIKeys ? Buffer.from(`${apikeys.key}:${apikeys.secret}` : Buffer.from(`${accountSid}:${authToken}`);

    const requestData = JSON.stringify({ token });
    const requestOption = {
      hostname: 'iam.twilio.com',
      port: 443,
      path: `/v1/Accounts/${accountSid}/Tokens/validate`,
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization.toString('base64')}`,
      },
    };

    const req = https.request(requestOption, (resp) => {
      let data = '';
      resp.setEncoding('utf8');
      resp.on('data', (d) => (data += d));
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.valid) {
            resolve(result);
          } else {
            reject(result.message);
          }
        } catch (err) {
          reject(err.message);
        }
      });
    });
    req.on('error', (err) => reject(err.message));
    req.write(requestData);
    req.end();
  });
};

/**
 * A validator to be used with Twilio Function. It uses the {@link validator} to validate the token
 *
 * @param handlerFn    the Twilio Runtime Handler Function
 */
export const functionValidator = (handlerFn: HandlerFn): HandlerFn => {
  return (context, event, callback) => {
    const failedResponse = (message: string) => {
      const response = new Twilio.Response();
      response.appendHeader('Access-Control-Allow-Origin', '*');
      response.appendHeader('Access-Control-Allow-Methods', 'OPTIONS, POST, GET');
      response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.appendHeader('Content-Type', 'plain/text');
      response.setStatusCode(403);
      response.setBody(message);

      callback(null, response);
    };

    const accountSid = context.ACCOUNT_SID;
    const authToken = context.AUTH_TOKEN;
    const token = event.Token;

    if (!accountSid || !authToken) {
      return failedResponse(
        'Unauthorized: AccountSid or AuthToken was not provided. For more information, please visit https://twilio.com/console/runtime/functions/configure',
      );
    }

    return validator(token, accountSid, authToken)
      .then((result) => {
        event.TokenResult = result;
        return handlerFn(context, event, callback);
      })
      .catch(failedResponse);
  };
};