import {queryName} from 'nostr-tools/nip05'
import {Notify} from 'quasar'

import bus from '../bus'
import {pool, signAsynchronously} from '../pool'
import {dbSave, dbGetMetaEvent, dbDeleteEvent} from '../db'
import {processMentions, getPubKeyTagWithRelay} from '../utils/helpers'
import {metadataFromEvent} from '../utils/event'

export function initKeys(store, keys) {
  store.commit('setKeys', keys)

  // also initialize the lastNotificationRead value
  store.commit('haveReadNotifications')
}

export async function launch(store) {
  if (!store.state.keys.pub) {
    store.commit('setKeys') // passing no arguments will cause a new seed to be generated

    // also initialize the lastNotificationRead value
    store.commit('haveReadNotifications')
  }

  // if we have already have a private key
  if (store.state.keys.priv) {
    pool.setPrivateKey(store.state.keys.priv)
  } else {
    pool.registerSigningFunction(signAsynchronously)
  }

  // our current stuff before loading events
  var {relays, following} = store.state

  // load list of people we're following from kind3 event
  let contactList = await dbGetMetaEvent(3, store.state.keys.pub)
  if (contactList) {
    following = contactList.tags
      .filter(([t, v]) => t === 'p' && v)
      .map(([_, v]) => v)
  }

  // load list of relays from kind10001 event
  let relayList = await dbGetMetaEvent(10001, store.state.keys.pub)
  if (relayList) {
    relays = relayList.tags
      .filter(([t, _, __]) => t.startsWith('ws://') || t.startsWith('wss://'))
      .filter(tag => tag.length === 3)
  }

  // update store state
  store.commit('setFollowing', following)
  store.commit('setRelays', relays)

  // setup pool
  store.state.relays.forEach(([url, read, write]) => {
    pool.addRelay(url, {read: read === '', write: write === ''})
  })
  pool.onNotice((notice, relay) => {
    Notify.create({
      message: `Relay ${relay.url} says: ${notice}`,
      color: 'info'
    })
  })

  // preload our own profile from the db
  await store.dispatch('useProfile', {pubkey: store.state.keys.pub})

  // start listening for nostr events
  store.dispatch('restartMainSubscription')
}

var mainSub = pool

export function restartMainSubscription(store) {
  mainSub = mainSub.sub(
    {
      skipVerification: true,
      filter: [
        // notes, profiles and contact lists of people we follow (and ourselves)
        {
          kinds: [0, 1, 2, 3],
          authors: store.state.following.concat(store.state.keys.pub)
        },

        // posts mentioning us
        {
          kinds: [1],
          '#p': [store.state.keys.pub]
        },

        // our relays
        {
          kinds: [10001],
          authors: [store.state.keys.pub]
        }
      ],
      cb: async (event, relay) => {
        switch (event.kind) {
          case 0:
            break
          case 1:
            break
          case 2:
            break
          case 3: {
            if (event.pubkey === store.state.keys.pub) {
              // we got a new contact list from ourselves
              // we must update our local relays and following lists
              // if we don't have any local lists yet
              let local = await dbGetMetaEvent(3, store.state.keys.pub)
              if (!local || local.created_at < event.created_at) {
                var relays, following
                try {
                  relays = JSON.parse(event.content)
                  store.commit('setRelays', relays)
                } catch (err) {
                  /***/
                }

                following = event.tags
                  .filter(([t, v]) => t === 'p' && v)
                  .map(([_, v]) => v)
                store.commit('setFollowing', following)

                following.forEach(f =>
                  store.dispatch('useProfile', {pubkey: f})
                )
              }
            }
            break
          }
          case 4:
            break
        }

        store.dispatch('addEvent', {event, relay})
      }
    },
    'main-channel'
  )
}

export async function sendPost(store, {message, tags = [], kind = 1}) {
  if (message.length === 0) return

  let event
  try {
    const unpublishedEvent = await processMentions({
      pubkey: store.state.keys.pub,
      created_at: Math.floor(Date.now() / 1000),
      kind,
      tags,
      content: message
    })

    event = await pool.publish(unpublishedEvent)
  } catch (err) {
    Notify.create({
      message: `Did not publish: ${err}`,
      color: 'negative'
    })
    return
  }

  if (!event) {
    // aborted
    return
  }

  store.dispatch('addEvent', {event})
  return event
}

export async function setMetadata(store, metadata) {
  let event = await pool.publish({
    pubkey: store.state.keys.pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: [],
    content: JSON.stringify(metadata)
  })

  store.dispatch('addEvent', {event})
}

export async function recommendServer(store, url) {
  await pool.publish({
    pubkey: store.state.keys.pub,
    created_at: Math.round(Date.now() / 1000),
    kind: 2,
    tags: [],
    content: url
  })
}

export async function addEvent(store, {event, relay = null}) {
  bus.emit('event', event)

  switch (event.kind) {
    case 0:
      await dbSave(event, relay)
      store.dispatch('useProfile', {pubkey: event.pubkey})
      break
    case 1:
      store.commit('addToHomeFeed', event)
      break
    case 2:
      break
    case 3:
      await dbSave(event, relay)
      store.dispatch('useContacts', event.pubkey)
      break
    case 4:
      break
    case 10001:
      await dbSave(event, relay)
      break
  }
}

export async function useProfile(store, {pubkey, request = false}) {
  let metadata

  if (pubkey in store.state.profilesCache) {
    // we don't fetch again, but we do commit this so the LRU gets updated
    store.commit('addProfileToCache', {
      pubkey,
      ...store.state.profilesCache[pubkey]
    }) // (just the pubkey is enough)
    return
  }

  // fetch from db and add to cache
  let event = await dbGetMetaEvent(0, pubkey)
  if (event) {
    metadata = metadataFromEvent(event)
  } else if (request) {
    // try to request from a relay
    await new Promise(resolve => {
      let sub = pool.sub({
        filter: [{authors: [pubkey], kinds: [0]}],
        cb: async event => {
          metadata = metadataFromEvent(event)
          clearTimeout(timeout)
          if (sub) sub.unsub()
          resolve()
        }
      })
      let timeout = setTimeout(() => {
        sub.unsub()
        sub = null
        resolve()
      }, 2000)
    })
  }

  if (metadata) {
    store.commit('addProfileToCache', metadata)

    if (metadata.nip05) {
      if (metadata.nip05 === '') delete metadata.nip05

      let cached = store.state.nip05VerificationCache[metadata.nip05]
      if (cached && cached.when > Date.now() / 1000 - 60 * 60) {
        if (cached.pubkey !== pubkey) delete metadata.nip05
      } else {
        let checked = await queryName(metadata.nip05)
        store.commit('addToNIP05VerificationCache', {
          pubkey: checked,
          identifier: metadata.nip05
        })
        if (pubkey !== checked) delete metadata.nip05
      }

      store.commit('addProfileToCache', metadata)
    }
  }
}

export async function useContacts(store, pubkey) {
  if (pubkey in store.state.contactListCache) {
    // we don't fetch again, but we do commit this so the LRU gets updated
    store.commit('addContactListToCache', store.state.contactListCache[pubkey])
  } else {
    // fetch from db and add to cache
    let event = await dbGetMetaEvent(3, pubkey)
    if (event) {
      store.commit('addContactListToCache', event)
    }
  }
}

export async function publishContactList(store) {
  // extend the existing tags
  let event = await dbGetMetaEvent(3, store.state.keys.pub)
  var tags = event?.tags || []

  // remove contacts that we're not following anymore
  tags = tags.filter(
    ([t, v]) => t === 'p' && store.state.following.find(f => f === v)
  )

  // now we merely add to the existing event because it might contain more data in the
  // tags that we don't want to replace
  await Promise.all(
    store.state.following.map(async pubkey => {
      if (!tags.find(([t, v]) => t === 'p' && v === pubkey)) {
        tags.push(await getPubKeyTagWithRelay(pubkey))
      }
    })
  )

  event = await pool.publish({
    pubkey: store.state.keys.pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 3,
    tags,
    content: ''
  })

  await store.dispatch('addEvent', {event})

  Notify.create({
    message: 'Updated and published list of contacts.',
    color: 'positive'
  })
}

export async function publishRelaysList(store) {
  let event = await pool.publish({
    pubkey: store.state.keys.pub,
    created_at: Math.floor(Date.now() / 1000),
    kind: 10001,
    tags: store.state.relays,
    content: ''
  })

  await store.dispatch('addEvent', {event})

  Notify.create({
    message: 'Updated and published list of relays.',
    color: 'positive'
  })
}

export async function deleteEvent(store, {event}) {
  await dbDeleteEvent(event.id)
  store.commit('removeFromHomeFeed', event.id)
  await pool.publish({
    pubkey: store.state.keys.pub,
    kind: 5,
    tags: [['e', event.id], ...event.tags]
  })
}
