<template>
  <q-card class="no-shadow py-6 bg-inherit">
    <q-card-section>
      <q-form @submit="sendPost">
        <q-input
          ref="input"
          v-model="text"
          autogrow
          autofocus
          label="What's happening?"
          @keypress.ctrl.enter="sendPost"
        >
          <template #before>
            <q-avatar
              round
              size="60px"
              class="cursor-pointer mr-4"
              @click="toProfile($store.state.keys.pub)"
            >
              <img :src="$store.getters.avatar($store.state.keys.pub)" />
            </q-avatar>
          </template>
        </q-input>
          <div class="flex justify-end mt-3 gap-2">
            <!-- display the name of the file -->
            <div v-if="audioFile" class="text-accent font-mono">
              {{ audioFile.name }}
            </div>
            <!-- upload audio button -->
            <input id="fileUpload" ref="file" type="file" accept="audio/*" hidden>
            <q-btn
              v-close-popup
              label="Upload Audio"
              rounded
              unelevated
              type="submit"
              color="primary"
              icon="folder_open"
              @click="selectAudio"
            />
          <q-btn
            v-close-popup
            label="Publish"
            rounded
            unelevated
            type="submit"
            color="primary"
          />
        </div>
      </q-form>
    </q-card-section>
  </q-card>
</template>

<script>
import helpersMixin from '../utils/mixin'
import { uploadFile } from '../utils/blob'

export default {
  mixins: [helpersMixin],

  data() {
    return {
      text: '',
      audioFile: null,
    }
  },

  computed: {
    textarea() {
      return this.$refs.input.$el.querySelector('textarea')
    },
    mentions() {
      return this.createMentionsProvider()
    }
  },

  mounted() {
    this.mentions.attach(this.textarea)
  },

  beforeUnmount() {
    this.mentions.detach(this.textarea)
  },

  methods: {
    async sendPost() {
      if (!this.text.length) {
        return
      }
      const fileUrl = await uploadFile(this.audioFile)
      console.log({fileUrl})
      let event = await this.$store.dispatch('sendPost', {message: this.text})
      if (event) this.toEvent(event.id)
    },
    selectAudio() {
      this.$refs.file.click()
      this.$refs.file.onchange = (e) => {
        this.audioFile = e.target.files[0]
      }
    }
  }
}
</script>
