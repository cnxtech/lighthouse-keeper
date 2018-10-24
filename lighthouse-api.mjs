/**
 * Copyright 2018 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import url from 'url';
const URL = url.URL;
import fetch from 'node-fetch';

const LHR = JSON.parse(fs.readFileSync('./lhr.json', 'utf8'));

/**
 * Wrapper for interactions with the Lighthouse API.
 */
class LighthouseAPI {
  /**
   * @export
   */
  static get version() { return 'v5'; }

  /**
   * @export
   */
  static get endpoints() {
    const scope = 'https://www-googleapis-staging.sandbox.google.com/pagespeedonline';
    return {
      scope,
      audit: `${scope}/${this.version}/runPagespeed`,
    };
  }

  /**
   * @constructor
   * @param {string} apiKey
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Audits a site.
   * @param {string} url Url to audit.
   * @return {!Object} API response.
   * @export
   */
  async audit(url) {
    const auditUrl = new URL(LighthouseAPI.endpoints.audit);
    auditUrl.searchParams.set('key', this.apiKey);
    auditUrl.searchParams.set('locale', 'en_US');
    auditUrl.searchParams.set('strategy', 'mobile');
    // Include all categories.
    Object.keys(LHR.categories).forEach(cat => {
      // Note: API uses "best_practices" instead of "best-practices".
      // This is going away soon.
      auditUrl.searchParams.append('category', cat.replace(/-/g, '_'));
    });
    auditUrl.searchParams.set('url', url);

    try {
      const resp = await fetch(auditUrl);
      if (!resp.ok) {
        throw Error(`${resp.status} from Lighthouse API: ${resp.statusText}`);
      }

      const json = await resp.json();

      if (json.captchaResult && json.captchaResult !== 'CAPTCHA_NOT_NEEDED') {
        throw Error(`Lighthouse API response: ${json.captchaResult}`);
      }

      if (json.error) {
        throw Error(json.error.errors);
      }

      let lhr = json.lighthouseResponse;
      if (!lhr) {
        throw Error('Lighthouse API response: missing lighthouseResponse.');
      }

      // TODO(ericbidelman): LHR results in object are a string but might
      // become an object in the future. Support both for now.
      lhr = (typeof lhr === 'string') ? JSON.parse(lhr) : lhr;
      delete lhr.i18n; // Remove extra cruft.

      const crux = {};
      // Firestore cannot save object keys with values of undefined, so make
      // sure to only include each crux key when the API has populated values.
      if (json.loadingExperience) {
        crux.loadingExperience = json.loadingExperience;
      }
      if (json.originLoadingExperience) {
        crux.originLoadingExperience = json.originLoadingExperience;
      }

      return {lhr, crux};
    } catch (err) {
      console.error(err);
      throw err;
    }
  }
}

export default LighthouseAPI;
