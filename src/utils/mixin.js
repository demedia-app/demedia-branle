import relative from 'relative-date'
import {date} from 'quasar'
import Tribute from 'tributejs'
import {shorten} from './helpers'

export default {
  methods: {
    getLocation() {
      return location
    },

    json(o) {
      return JSON.stringify(o, null, 2)
    },

    log(o) {
      return console.log(o)
    },

    toProfile(pubkey) {
      this.$router.push('/' + pubkey)
    },

    toEvent(id, pubkey = null) {
      this.$router.push(`/event/${id}${pubkey ? `:${pubkey}` : ''}`)
    },

    shorten,

    niceDate(value) {
      if (value + 60 * 60 /* an hour */ > Date.now() / 1000) {
        return relative(value * 1000)
      }

      return date.formatDate(value * 1000, 'YYYY MMM D h:mm A')
    },

    interpolateMentions(text, tags) {
      let audioLink = null
      let verified = null
      const replacer = (_, index) => {
        if (tags.length >= 2) {
          const profile = tags[Number(index)][1]
          const displayName = this.$store.getters.displayName(profile)
          return `[@${displayName}](/${profile})`
        } else {
          return _
        }
      }
      const audioTag = tags.find(tag => tag.find(t => t === 'audio'))
      if (audioTag) {
        audioLink = audioTag[1]
      }
      const verifiedTag = tags.find(tag => tag.find(t => t === 'hash'))
      if (verifiedTag) {
        verified = verifiedTag[2]
      }
      return {
        text: text.replace(/\B@\[(\d+)\]\B/g, replacer),
        audioLink,
        verified
      }
    },

    createMentionsProvider(options) {
      const tribute = new Tribute({
        spaceSelectsMatch: true,
        menuShowMinLength: 1,

        selectTemplate: item => `@${item.original.value.pubkey}`,

        menuItemTemplate: item => {
          return `
            <div class="flex items-center">
              <div class="inline-flex items-center">
                <div class="text-secondary mr-2">${item.string}</div>
                ${
                  item.original.value.nip05
                    ? '<i class="notranslate material-icons text-accent mr-1 -ml-1" aria-hidden="true" role="presentation">verified</i>'
                    : ''
                }
              </div>
              <div class="text-accent font-mono text-xs">${shorten(
                item.original.value.pubkey
              )}</div>
            </div>
            `
        },

        values: (_pattern, callback) => {
          callback(
            this.$store.getters.namedProfiles.map(profile => ({
              key: this.$store.getters.displayName(profile.pubkey),
              value: profile
            }))
          )
        },

        noMatchTemplate: () => undefined // hide "No matches"
      })

      return {
        attach: element => tribute.attach(element),
        detach: element => tribute.detach(element)
      }
    },

    deleteEvent(event) {
      this.$store.dispatch('deleteEvent', {event})
      this.$router.go()
    }
  }
}
