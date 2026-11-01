package model

type FileUploadResult struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	FileSize    int64  `json:"file_size"`
	URL         string `json:"url"`
}

type UploadResponse struct {
	ID       string             `json:"id,omitempty"`
	Filename string             `json:"filename,omitempty"`
	URL      string             `json:"url,omitempty"`
	IDs      []string           `json:"ids,omitempty"`
	Files    []FileUploadResult `json:"files,omitempty"`
}
