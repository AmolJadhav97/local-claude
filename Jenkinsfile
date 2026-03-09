pipeline {
    agent any

    environment {
        // ── Change these two lines to match your DockerHub username and repo name
        IMAGE_NAME   = 'amoljadhav1997/local-claude'
        GITHUB_REPO  = 'github.com/AmolJadhav97/local-claude.git'

        // ── These are injected from Jenkins Credentials — never hardcoded
        IMAGE_TAG    = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
    }

    // Only run pipeline when files inside frontend/ change
    triggers {
        githubPush()
    }

    stages {

        // ── Stage 1: Pull the latest code
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // ── Stage 3: Build Docker image
        stage('Build Docker Image') {
            steps {
                script {
                    echo "🔨 Building image: ${IMAGE_NAME}:${IMAGE_TAG}"
                    sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} ."
                }
            }
        }

        // ── Stage 4: Security scan with Trivy — BLOCKS on CRITICAL vulnerabilities
        stage('Trivy Security Scan') {
            steps {
                script {
                    echo "🔍 Running Trivy scan on ${IMAGE_NAME}:${IMAGE_TAG}"
                    sh """
                        docker run --rm \
                            -v /var/run/docker.sock:/var/run/docker.sock \
                            -v \$HOME/.trivy-cache:/root/.cache/ \
                            aquasec/trivy image \
                            --exit-code 1 \
                            --severity CRITICAL \
                            --no-progress \
                            --ignore-unfixed \
                            ${IMAGE_NAME}:${IMAGE_TAG}
                    """
                }
            }
        }

        // ── Stage 5: Push to DockerHub (only after scan passes)
        stage('Push to DockerHub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh """
                        echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin
                        docker push ${IMAGE_NAME}:${IMAGE_TAG}
                        docker tag  ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:latest
                        docker push ${IMAGE_NAME}:latest
                        docker logout
                    """
                }
            }
        }

        // ── Stage 6: Update k8s manifest with new image tag → ArgoCD picks it up
        stage('Update Kubernetes Manifest') {
            steps {
                withCredentials([string(
                    credentialsId: 'github-pat-secret',
                    variable: 'GH_TOKEN'
                )]) {
                    sh """
                        git config user.email "jenkins@local.build"
                        git config user.name  "Jenkins CI"

                        # Update the image tag in deployment.yaml
                        sed -i 's|image: ${IMAGE_NAME}:.*|image: ${IMAGE_NAME}:${IMAGE_TAG}|g' k8s/deployment.yaml

                        # Commit and push — ArgoCD will detect this change automatically
                        git add k8s/deployment.yaml
                        git commit -m "ci: bump frontend image to ${IMAGE_TAG} [skip ci]"
                        git push https://\${GH_TOKEN}@${GITHUB_REPO} HEAD:main
                    """
                }
            }
        }
    }

    // ── Cleanup: always remove local image to save disk space
    post {
        always {
            sh "docker rmi ${IMAGE_NAME}:${IMAGE_TAG} || true"
            sh "docker rmi ${IMAGE_NAME}:latest     || true"
        }
        success {
            echo "✅ Pipeline complete. ArgoCD will sync the new image to your KIND cluster automatically."
        }
        failure {
            echo "❌ Pipeline failed. Check the logs above for details."
        }
        unstable {
            echo "⏭  Pipeline skipped — no frontend changes."
        }
    }
}
