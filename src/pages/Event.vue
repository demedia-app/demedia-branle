<template>
  <q-dialog v-model="metadataDialog">
    <RawEventData :event="event" />
  </q-dialog>

  <q-page class="px-4 py-6">
    <div class="text-xl text-center">Event</div>

    <q-separator class="my-6" />

    <div v-if="ancestors.length">
      <Thread :events="ancestors" is-ancestors />
    </div>

    <div ref="main" class="py-4 px-1">
      <div v-if="event">
        <div class="flex items-center">
          <q-avatar
            class="no-shadow cursor-pointer"
            @click="toProfile(event.pubkey)"
          >
            <img :src="$store.getters.avatar(event.pubkey)" />
          </q-avatar>
          <div class="text-lg ml-4">
            <Name :pubkey="event.pubkey" />
          </div>
          <div class="text-accent font-mono ml-4">
            {{ shorten(event.pubkey) }}
          </div>
          <div v-if="content?.verified === 'true'" class="ml-2">
            <q-icon name="verified" color="accent" />
          </div>
          <div
            v-if="$route.params.eventId.split(':')[1] === event.pubkey"
            class="ml-auto"
          >
            <q-icon
              name="delete"
              color="primary"
              class="cursor-pointer"
              @click="deleteEvent(event)"
            />
          </div>
        </div>
        <div
          class="text-xl my-4 font-sans break-words"
          style="hyphens: auto !important"
        >
          <Markdown>{{ content.text }}</Markdown>
          <div v-if="content.audioLink" class="flex justify-center mt-2">
            <q-media-player
              type="audio"
              :source="content.audioLink"
              class="w-full"
              cross-origin="anonymous"
              style="
                --mediaplayer-color: #2262ba;
                --mediaplayer-color-dark: #2262ba;
                --mediaplayer-background: #;
              "
            />
          </div>
        </div>
        <div class="flex items-center justify-between w-full">
          <q-icon
            size="xs"
            name="info"
            class="opacity-50 cursor-pointer mr-1"
            @click="metadataDialog = true"
          />
          <div
            class="opacity-40 cursor-pointer hover:underline"
            @click="toEvent(event.id)"
          >
            {{ niceDate(event.created_at) }}
          </div>
          <q-btn
            round
            unelevated
            flat
            :color="replying ? 'secondary' : 'primary'"
            icon="quickreply"
            size="lg"
            @click="replying = !replying"
          />
        </div>
        <div v-if="replying" class="mt-4">
          <Reply v-if="event" :event="event" :seen-on-relay="seenOn[0]" />
        </div>
      </div>
      <div v-else class="font-mono text-slate-400 p-8">
        Event {{ $route.params.eventId.split(':')[0] }}
      </div>
    </div>

    <div v-if="seenOn?.length">
      <q-separator class="my-2" />
      <div class="text-lg mx-4 mt-6 mb-4">Seen on</div>
      <ul class="mb-2 pl-4 text-md list-disc">
        <li v-for="relay in seenOn" :key="relay">
          <span class="text-accent opacity-65">
            {{ relay }}
          </span>
        </li>
      </ul>
    </div>

    <div v-if="missingFrom.length">
      <div class="text-lg mx-4 mt-6 mb-4">Not seen on</div>
      <ul class="mb-2 pl-4 text-md list-disc">
        <li v-for="relay in missingFrom" :key="relay" class="cursor-pointer">
          {{ relay }}
          <q-btn
            label="Publish"
            rounded
            unelevated
            color="accent"
            size="xs"
            class="py-0 px-1 ml-2"
            @click="publishTo(relay)"
          />
        </li>
      </ul>
    </div>

    <div v-if="childrenThreads.length">
      <q-separator class="my-2" />
      <div class="text-lg mx-4 mt-6 mb-4">Replies</div>
      <div v-for="thread in childrenThreads" :key="thread[0].id">
        <Thread :events="thread" />
        <q-separator />
      </div>
    </div>
  </q-page>
</template>

<script>
import {pool} from '../pool'
import helpersMixin from '../utils/mixin'
import {addToThread} from '../utils/threads'

export default {
  name: 'Event',
  mixins: [helpersMixin],

  data() {
    return {
      metadataDialog: false,
      replying: false,
      userHasActed: false,
      ancestors: [],
      ancestorsSet: new Set(),
      ancestorsSub: null,
      event: null,
      eventSub: null,
      childrenThreads: [],
      childrenSet: new Set(),
      childrenSub: null,
      eventUpdates: null,
      seenOn: []
    }
  },

  computed: {
    missingFrom() {
      if (!this.event || !this.seenOn) return []

      return Object.entries(this.$store.state.relays)
        .filter(([_, __, write]) => write === '')
        .map(([url, _, __]) => url)
        .filter(url => this.seenOn.indexOf(url) === -1)
    },
    content() {
      if (!this.event) return null
      return this.interpolateMentions(this.event.content, this.event.tags)
    }
  },

  watch: {
    '$route.params.eventId'(curr, prev) {
      if (curr && curr !== prev) {
        this.stop()
        this.start()
      }
    }
  },

  mounted() {
    const startInterval = setInterval(() => {
      // Code that will run only after the
      // entire view has been rendered
      let videoElements = document.getElementsByTagName('video')
      for (let i = 0; i < videoElements.length; i++) {
        // videoElements[i].setAttribute('crossorigin', 'anonymous')
        videoElements[i].setAttribute('type', 'audio/mp3')
      }
      if (
        videoElements.length !== 0 ||
        (videoElements.length === 0 && this.content && !this.content?.audioLink)
      ) {
        clearInterval(startInterval)
      }
    }, 0)
    this.start()
  },

  beforeUnmount() {
    this.stop()
  },

  updated() {
    this.$nextTick(() => {
      if (this.screenHasMoved) {
        this.$refs.main.scrollIntoView()
      }
    })
  },

  methods: {
    start() {
      this.seenOn = []
      this.listen()
      window.addEventListener('scroll', this.detectedUserActivity)
      window.addEventListener('click', this.detectedUserActivity)
    },

    stop() {
      this.replying = false
      if (this.ancestorsSub) this.ancestorsSub.unsub()
      if (this.childrenSub) this.childrenSub.unsub()
      if (this.eventSub) this.eventSub.unsub()
      if (this.eventUpdates) this.eventUpdates.cancel()
      window.removeEventListener('scroll', this.detectedUserActivity)
      window.removeEventListener('click', this.detectedUserActivity)
    },

    detectedUserActivity() {
      this.userHasActed = true
    },

    async listen() {
      const [eventId, author] = this.$route.params.eventId.split(':')
      const filter = {ids: [eventId]}
      if (author) filter.authors = [author]
      this.eventSub = pool.sub(
        {
          filter,
          cb: async (event, relay) => {
            this.seenOn.push(relay)

            // only do this once
            if (this.seenOn.length === 1) {
              this.event = event
              this.$store.dispatch('useProfile', {
                pubkey: this.event.pubkey,
                request: true
              })
              setTimeout(() => {
                this.eventSub.unsub()
              }, 2000)
              this.listenAncestors()
            }
          }
        },
        'event-browser'
      )

      this.listenChildren()
    },

    listenChildren() {
      this.childrenThreads = []
      this.childrenSet = new Set()
      this.childrenSub = pool.sub(
        {
          filter: [
            {
              '#e': [this.$route.params.eventId.split(':')[0]],
              kinds: [1]
            }
          ],
          cb: async (event, relay) => {
            if (this.childrenSet.has(event.id)) return

            // only do this once for each children
            this.childrenSet.add(event.id)
            this.$store.dispatch('useProfile', {
              pubkey: event.pubkey,
              request: true
            })
            addToThread(this.childrenThreads, event)
            return
          }
        },
        'event-children'
      )
    },

    listenAncestors() {
      this.ancestors = []
      this.ancestorsSet = new Set()

      let eventTags = this.event.tags.filter(([t, _]) => t === 'e')
      if (eventTags.length) {
        this.ancestorsSub = pool.sub(
          {
            filter: [
              {
                kinds: [1],
                ids: eventTags.map(([_, v]) => v)
              }
            ],
            cb: async event => {
              if (this.ancestorsSet.has(event.id)) return

              // only do this once for each ancestor
              this.$store.dispatch('useProfile', {
                pubkey: event.pubkey,
                request: true
              })
              this.ancestorsSet.add(event.id)

              // manual sorting
              // older events first
              for (let i = 0; i < this.ancestors.length; i++) {
                if (event.created_at < this.ancestors[i].created_at) {
                  // the new event is older than the current index,
                  // so we add it at the previous index
                  this.ancestors.splice(i, 0, event)
                  return
                }
              }

              // the newer event is the newest, add to end
              this.ancestors.push(event)

              return
            }
          },
          'event-ancestors'
        )
      }
    },

    publishTo(relayURL) {
      pool.relays[relayURL]?.relay?.publish?.(this.event)
    }
  }
}
</script>
