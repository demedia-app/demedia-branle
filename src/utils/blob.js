import S3 from 'aws-sdk/clients/s3'

const s3 = new S3({
  accessKeyId: process?.env?.ACCESS_KEY_ID_AWS || '',
  secretAccessKey: process?.env?.SECRET_ACCESS_KEY_AWS || '',
  region: process?.env?.REGION_AWS || ''
})

export const uploadFile = async file => {
  const params = {
    Bucket: process?.env?.S3_BUCKET_AWS || '',
    Key: file.name,
    Body: file,
    ACL: 'public-read',
    Metadata: {
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  }
  await s3
    .upload(params, (err, data) => {
      if (err) {
        console.error(err)
        return null
      }
      if (data) {
        return data
      }
    })
    .promise()

  return `https://${process?.env?.S3_BUCKET_AWS || ''}.s3.amazonaws.com/${
    file.name
  }`
}
