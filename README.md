# Branle

An experimental twitter-like [DeMedia](https://github.com/demedia-app/demedia-nostr) client using [absurd-sql](https://github.com/jlongster/absurd-sql) with audio sharing feature.

https://user-images.githubusercontent.com/1653275/149637874-5ae1e400-1de0-42f1-9946-c4cec19347ed.mp4

**Branle** assumes it will be deployed to [Netlify](https://netlify.com/). If you want to deploy it elsewhere in your own machine you'll have to find a way to mimic the custom headers and avatar proxy function. See [netlify.toml](netlify.toml).

## Install the dependencies

```bash
yarn
```

### Start the app in development mode (hot-code reloading, error reporting, etc.)

```bash
ACCESS_KEY_ID_AWS=aws_access_key_id \
    SECRET_ACCESS_KEY_AWS=aws_secret_access_key \
    S3_BUCKET_AWS=aws_s3_bucket \
    REGION_AWS=aws_region \
    LOCAL_RELAY=ws://localhost:7448 \
    yarn dev
```

### Customize the brand

Edit `customize.json` and replace the colors, icon, name and dark mode setting.
When setting the dark mode, you can also set the colors `"dark-page"` and `"dark"`.

