package storage

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	appconfig "github.com/brAIn-gAIm/CDN/internal/config"
)

type S3Client struct {
	client *s3.Client
	bucket string
}

type ObjectReader struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	ContentRange  string
	ETag          string
	Metadata      map[string]string
}

func New(ctx context.Context, cfg *appconfig.Config) (*S3Client, error) {
	customCreds := credentials.NewStaticCredentialsProvider(
		cfg.S3AccessKey,
		cfg.S3SecretKey,
		"",
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion(cfg.S3Region),
		awsconfig.WithCredentialsProvider(customCreds),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.S3Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.S3Endpoint)
		}
		o.UsePathStyle = cfg.S3UsePathStyle
	})

	s := &S3Client{
		client: client,
		bucket: cfg.S3Bucket,
	}

	if err := s.ensureBucket(ctx); err != nil {
		return nil, fmt.Errorf("ensure bucket %s: %w", cfg.S3Bucket, err)
	}

	return s, nil
}

func (s *S3Client) ensureBucket(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(s.bucket),
	})
	if err == nil {
		return nil
	}

	_, createErr := s.client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(s.bucket),
	})
	if createErr != nil {
		var bExists *s3types.BucketAlreadyExists
		var bOwned *s3types.BucketAlreadyOwnedByYou
		if errors.As(createErr, &bExists) || errors.As(createErr, &bOwned) {
			return nil
		}
		return fmt.Errorf("create bucket: %w", createErr)
	}
	return nil
}

func (s *S3Client) Ping(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(s.bucket),
	})
	return err
}

func (s *S3Client) Upload(ctx context.Context, key string, body io.Reader, size int64, contentType string, metadata map[string]string) error {
	input := &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
		Metadata:      metadata,
	}
	_, err := s.client.PutObject(ctx, input)
	return err
}

func (s *S3Client) Get(ctx context.Context, key string, rangeHeader string) (*ObjectReader, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}
	if rangeHeader != "" {
		input.Range = aws.String(rangeHeader)
	}

	out, err := s.client.GetObject(ctx, input)
	if err != nil {
		return nil, err
	}

	res := &ObjectReader{
		Body:     out.Body,
		Metadata: out.Metadata,
	}
	if out.ContentType != nil {
		res.ContentType = *out.ContentType
	}
	if out.ContentLength != nil {
		res.ContentLength = *out.ContentLength
	}
	if out.ContentRange != nil {
		res.ContentRange = *out.ContentRange
	}
	if out.ETag != nil {
		res.ETag = *out.ETag
	}

	return res, nil
}

func (s *S3Client) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (s *S3Client) FindKeyByID(ctx context.Context, id string) (string, error) {
	prefix := id + "/"
	out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(s.bucket),
		Prefix:  aws.String(prefix),
		MaxKeys: aws.Int32(1),
	})
	if err != nil {
		return "", err
	}
	if len(out.Contents) > 0 && out.Contents[0].Key != nil {
		return *out.Contents[0].Key, nil
	}

	// Fallback to checking exact key matching id
	_, headErr := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(id),
	})
	if headErr == nil {
		return id, nil
	}

	return "", fmt.Errorf("object not found for id %s", id)
}

func (s *S3Client) DeleteByID(ctx context.Context, id string) error {
	prefix := id + "/"
	out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		return err
	}

	for _, obj := range out.Contents {
		if obj.Key != nil {
			if err := s.Delete(ctx, *obj.Key); err != nil {
				return err
			}
		}
	}
	// Also attempt to delete key matching id directly
	return s.Delete(ctx, id)
}
