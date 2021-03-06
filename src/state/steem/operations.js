import actions from './actions'
import steem from 'steem'
import last from 'lodash.last'
import { uiOperations } from '../ui'
import { formatReputation, vests2Steem } from '../../common/utils'

const {
  accountHistorySet,
  accountHistoryStatusSet,
  usernameStatusChanged,
  usernameChanged,
  reputationSet,
  followCountSet,
  delegationsSet,
  dynamicGlobalPropertiesSet,
  errorOccurred,
  errorCleared
} = actions

// Thunks
const accountHistoryLoadMore = () => async (dispatch, getState) => {
  // Cannor load account history data without a valid username
  if (getState().steem.usernameStatus !== 'VALID') return

  // Loading of account history data already in progress
  if (getState().steem.accountHistoryStatus === 'LOADING') return

  // Account history has been loaded completely, therefore exit
  if (getState().steem.accountHistoryStatus === 'LOADED_COMPLETELY') return

  const lastLoadedSequenceID = last(getState().steem.accountHistory)[0]
  // If initial load has already loaded the complete history, set status and exit
  if (lastLoadedSequenceID === 0) {
    dispatch(accountHistoryStatusSet('LOADED_COMPLETELY'))
    return
  }
  dispatch(accountHistoryStatusSet('LOADING'))
  const accountHistoryMoreData = await steem.api.getAccountHistoryAsync(getState().steem.username, lastLoadedSequenceID - 1, 100)
  dispatch(accountHistoryStatusSet('LOADED'))
  const accountHistoryMergedData = getState().steem.accountHistory.concat(accountHistoryMoreData.reverse())
  dispatch(accountHistorySet(accountHistoryMergedData))
  if (last(getState().steem.accountHistory)[0] === 0) {
    dispatch(accountHistoryStatusSet('LOADED_COMPLETELY'))
  }
}

const usernameSubmitted = (name) => async (dispatch, getState) => {
  dispatch(usernameStatusChanged('VALIDATING'))
  dispatch(accountHistoryStatusSet('LOADING'))
  try {
    let [accounts, accountHistory, followCount, delegations, dynamicGlobalProperties] = await Promise.all([
      steem.api.getAccountsAsync([name]),
      steem.api.getAccountHistoryAsync(name, -1, 100),
      steem.api.getFollowCountAsync(name),
      steem.api.getVestingDelegationsAsync(name, -1, 100),
      steem.api.getDynamicGlobalPropertiesAsync()
    ])
    if (!accounts[0]) { throw new Error('Sorry, no account found. Minimum 3 chars, no uppercase.') }
    dispatch(usernameChanged(name))
    dispatch(usernameStatusChanged('VALID'))
    dispatch(reputationSet(formatReputation(accounts[0].reputation)))
    dispatch(uiOperations.showFlag(`Welcome ${name}`, 'SteemDesk loves you!', 4000))

    if (!accountHistory) { throw new Error('Sorry, no account history found.') }
    accountHistory = accountHistory.reverse()
    dispatch(accountHistorySet(accountHistory))
    if (last(getState().steem.accountHistory)[0] === 0) {
      dispatch(accountHistoryStatusSet('LOADED_COMPLETELY'))
    } else {
      dispatch(accountHistoryStatusSet('LOADED'))
    }

    if (!followCount) { throw new Error('Sorry, could not get follow count for user.') }
    dispatch(followCountSet(followCount))

    if (!dynamicGlobalProperties) { throw new Error('Sorry, could not get dynamic global properties.') }
    dispatch(dynamicGlobalPropertiesSet(dynamicGlobalProperties))

    if (!delegations) { throw new Error('Sorry, could not get delegations for user.') }
    dispatch(delegationsSet(delegations.map((item) => {
      return {
        delegator: item.delegator,
        delegatee: item.delegatee,
        vesting_shares: item.vesting_shares,
        vesting_shares_sp: `${Number.parseFloat(vests2Steem(item.vesting_shares, dynamicGlobalProperties)).toFixed(0)} SP`,
        min_delegation_time: item.min_delegation_time
      }
    })))
  } catch (error) {
    console.log(error.message)
    dispatch(usernameStatusChanged('INVALID'))
    throw new Error('User is invalid.')
  }
}

export default {
  accountHistorySet,
  accountHistoryStatusSet,
  accountHistoryLoadMore,
  usernameStatusChanged,
  usernameChanged,
  usernameSubmitted,
  reputationSet,
  followCountSet,
  delegationsSet,
  dynamicGlobalPropertiesSet,
  errorOccurred,
  errorCleared
}
