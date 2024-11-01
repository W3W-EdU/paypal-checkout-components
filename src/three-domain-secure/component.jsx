/* @flow */
import { type LoggerType } from "@krakenjs/beaver-logger/src";
import { ZalgoPromise } from "@krakenjs/zalgo-promise/src";
import { create, type ZoidComponent } from "@krakenjs/zoid/src";
import { FPTI_KEY } from "@paypal/sdk-constants/src";

import { ValidationError } from "../lib";

type MerchantPayloadData = {|
  amount: string,
  currency: string,
  nonce: string,
  threeDSRequested?: boolean, // do we want to keep this name or align it with other 3DS documentation
  transactionContext?: Object,
  // experience context
|};

type Request = <TRequestData, TResponse>({|
  method?: string,
  url: string,
  // eslint-disable-next-line no-undef
  data: TRequestData,
  accessToken: ?string,
  // eslint-disable-next-line no-undef
|}) => Promise<TResponse>;

type requestData = {|
  intent: "THREE_DS_VERIFICATION",
  payment_source: {|
    card: {|
      single_use_token: string,
      verification_method: string,
    |},
  |},
  amount: {|
    currency_code: string,
    value: string,
  |},
  transaction_context?: {|
    soft_descriptor?: string,
  |},
|};

type responseBody = {|
  payment_id: string,
  status: string,
  intent: string,
  payment_source: {|
    card: {|
      last_digits: string,
      type: string,
      name: string,
      expiry: string,
    |},
  |},
  amount: {|
    currency_code: string,
    value: string,
  |},
  transaction_context: {|
    soft_descriptor: string,
  |},
  links: $ReadOnlyArray<{|
    href: string,
    rel: string,
    method: string,
  |}>,
|};

type SdkConfig = {|
  authenticationToken: ?string,
  paypalApiDomain: string,
|};

const parseSdkConfig = ({ sdkConfig, logger }): SdkConfig => {
  if (!sdkConfig.authenticationToken) {
    throw new ValidationError(
      `script data attribute sdk-client-token is required but was not passed`
    );
  }

  logger.info("three domain secure v2 invoked").track({
    [FPTI_KEY.TRANSITION]: "three_DS_auth_v2",
  });

  return sdkConfig;
};

const parseMerchantPayload = ({
  merchantPayload,
}: {|
  merchantPayload: MerchantPayloadData,
|}): requestData => {
  // what validation on merchant input should we do here?
  // empty object
  const { threeDSRequested, amount, currency, nonce, transactionContext } =
    merchantPayload;

  // amount - validate that it's a string
  // currency - validate that it's a string
  // what validations are done on the API end - what client side validation is the API expecting

  return {
    intent: "THREE_DS_VERIFICATION",
    payment_source: {
      card: {
        single_use_token: nonce,
        verification_method: threeDSRequested
          ? "SCA_ALWAYS"
          : "SCA_WHEN_REQUIRED",
      },
    },
    amount: {
      currency_code: currency,
      value: amount,
    },
    ...transactionContext,
  };
};

export interface ThreeDomainSecureComponentInterface {
  isEligible(): Promise<boolean>;
  show(): ZoidComponent<void>;
}
export class ThreeDomainSecureComponent {
  logger: LoggerType;
  request: Request;
  sdkConfig: SdkConfig;
  authenticationURL: string;

  constructor({
    logger,
    request,
    sdkConfig,
  }: {|
    logger: LoggerType,
    request: Request,
    sdkConfig: SdkConfig,
  |}) {
    this.logger = logger;
    this.request = request;
    this.sdkConfig = parseSdkConfig({ sdkConfig, logger });
  }

  async isEligible(merchantPayload: MerchantPayloadData): Promise<boolean> {
    const data = parseMerchantPayload({ merchantPayload });

    try {
      const { status, links } = await this.request<requestData, responseBody>({
        method: "POST",
        url: `${this.sdkConfig.paypalApiDomain}/v2/payments/payment`,
        data,
        accessToken: this.sdkConfig.authenticationToken,
      });

      let responseStatus = false;
      if (status === "PAYER_ACTION_REQUIRED") {
        this.authenticationURL = links[0].href;
        // check for rel = payer action inside the object
        responseStatus = true;
      }
      return responseStatus;
    } catch (error) {
      this.logger.warn(error);
      return false;
    }

    // change name to isContingent??
    // will return true or false
    // if payer action required, return true. obtain link from response for show method - check length of links

    // if payer action not required, return false

    // will make API request to v2/payments/pamyment endpoint with merchant payload an grab sdktoken as
    // bearer token

    // will need to handle errors from API response
    // What are the other options for status response and how do we handle them from a compliance standpoint
    // What do we do if we get a 500 error from the API?
    // do we throw an error or return false?
  }

  show() {
    create({ tag: "", url: "" });
  }
}
