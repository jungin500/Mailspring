import OnboardingActions from './onboarding-actions';
import {AccountStore, Actions} from 'nylas-exports';
import {shell, ipcRenderer} from 'electron';
import NylasStore from 'nylas-store';
import AccountTypes from './account-types';
import {buildWelcomeURL} from './account-helpers';

class PageRouterStore extends NylasStore {
  constructor() {
    super();

    this.listenTo(OnboardingActions.moveToPreviousPage, this._onMoveToPreviousPage)
    this.listenTo(OnboardingActions.moveToPage, this._onMoveToPage)
    this.listenTo(OnboardingActions.accountJSONReceived, this._onAccountJSONReceived)
    this.listenTo(OnboardingActions.setAccountInfo, this._onSetAccountInfo);
    this.listenTo(OnboardingActions.setAccountType, this._onSetAccountType);

    const {page, existingAccount} = NylasEnv.getWindowProps();

    if (existingAccount) {
      const accountType = AccountTypes.accountTypeForProvider(existingAccount.provider);

      this._pageStack = ['account-choose']
      this._onSetAccountType(accountType);
      this._onSetAccountInfo({
        name: existingAccount.name,
        email: existingAccount.email,
      });
    } else {
      this._pageStack = [page || 'welcome'];
    }
  }

  _onSetAccountType = (type) => {
    const nextPage = (type === 'gmail') ? "account-settings-gmail" : "account-settings";
    Actions.recordUserEvent('Auth Flow Started', {type});

    this._onSetAccountInfo(Object.assign({}, this._accountInfo, {type}));
    this._onMoveToPage(nextPage);
  }

  _onSetAccountInfo = (info) => {
    this._accountInfo = info;
    this.trigger();
  }

  _onMoveToPreviousPage = () => {
    this._pageStack.pop();
    this.trigger();
  }

  _onMoveToPage = (page) => {
    this._pageStack.push(page)
    this.trigger();
  }

  _onAccountJSONReceived = (json) => {
    try {
      const isFirstAccount = AccountStore.accounts().length === 0;

      AccountStore.addAccountFromJSON(json);
      this._accountFromAuth = AccountStore.accountForEmail(json.email_address);

      Actions.recordUserEvent('Auth Successful', {
        provider: this._accountFromAuth.provider,
      });
      ipcRenderer.send('new-account-added');
      NylasEnv.displayWindow();

      if (isFirstAccount) {
        this._onMoveToPage('initial-preferences');
        Actions.recordUserEvent('First Account Linked');

        // open the external welcome page
        const url = buildWelcomeURL(this._accountFromAuth);
        shell.openExternal(url, {activate: false});
      } else {
        // When account JSON is received, we want to notify external services
        // that it succeeded. Unfortunately in this case we're likely to
        // close the window before those requests can be made. We add a short
        // delay here to ensure that any pending requests have a chance to
        // clear before the window closes.
        setTimeout(() => {
          ipcRenderer.send('account-setup-successful');
        }, 100);
      }
    } catch (e) {
      NylasEnv.reportError(e);
      NylasEnv.showErrorDialog("Unable to Connect Account", "Sorry, something went wrong on the Nylas server. Please try again. If you're still having issues, contact us at support@nylas.com.");
    }
  }

  page() {
    return this._pageStack[this._pageStack.length - 1];
  }

  pageDepth() {
    return this._pageStack.length;
  }

  accountInfo() {
    return this._accountInfo;
  }

  accountFromAuth() {
    return this._accountFromAuth;
  }
}

export default new PageRouterStore();
