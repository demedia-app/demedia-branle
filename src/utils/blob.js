import S3 from 'aws-sdk/clients/s3'

const s3 = new S3({
  accessKeyId: process?.env?.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process?.env?.AWS_SECRET_ACCESS_KEY || '',
  region: process?.env?.AWS_REGION || ''
})

export const uploadFile = async file => {
  const params = {
    Bucket: process?.env?.AWS_S3_BUCKET || '',
    Key: file.name,
    Body: file,
    ACL: 'public-read'
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

   return `https://${process?.env?.AWS_S3_BUCKET || ''}.s3.amazonaws.com/${file.name}`
}
