// 3D Navigation JavaScript with Touch and Gyroscope Support
document.addEventListener('DOMContentLoaded', function() {
    // Find all nav containers and initialize them
    const containers = document.querySelectorAll('.nav-3d-container');
    
    containers.forEach(container => {
        initNav3D(container);
    });
});

function initNav3D(container) {
    const canvasContainer = container.querySelector('.canvas-container');
    if (!canvasContainer) return;
    
    const size = container.dataset.size || 'medium';
    const autoRotate = container.dataset.autoRotate === 'true';
    const gyroEnabled = container.dataset.gyro !== 'false'; // Default to true unless explicitly disabled
    const isLarge = size === 'large';
    const isMedium = size === 'medium';
    
    // Wait a moment for container to be properly sized
    setTimeout(() => {
        let width, height;
        
        if (isLarge) {
            width = window.innerWidth;
            height = window.innerHeight;
        } else {
            // Get the actual container dimensions
            const containerStyles = window.getComputedStyle(container);
            width = parseInt(containerStyles.width);
            height = parseInt(containerStyles.height);
        }
        
        if (width < 50 || height < 50) return;
        
        // Scene setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        
        renderer.setSize(width, height);
        renderer.setClearColor(0x000000, 0);
        
        // Clear any existing canvas elements
        canvasContainer.innerHTML = '';
        canvasContainer.appendChild(renderer.domElement);
        
        // Ensure the canvas fills the container
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';

        // Scale based on size - smaller for non-large versions
        const scale = isLarge ? 1 : (size === 'medium' ? 0.7 : 0.4);
        const vertices = new Float32Array([
            // Top triangle
            0, 0, -8 * scale,
            -1 * scale, 0, -2 * scale,
            1 * scale, 0, -2 * scale,
            // Bottom triangle  
            0, 0, 8 * scale,
            1 * scale, 0, 2 * scale,
            -1 * scale, 0, 2 * scale,
            // Left triangle
            -8 * scale, 0, 0,
            -2 * scale, 0, 1 * scale,
            -2 * scale, 0, -1 * scale,
            // Right triangle
            8 * scale, 0, 0,
            2 * scale, 0, -1 * scale,
            2 * scale, 0, 1 * scale
        ]);

        // Create wireframe
        const lineVertices = [];
        const lineIndices = [0,1,1,2,2,0,3,4,4,5,5,3,6,7,7,8,8,6,9,10,10,11,11,9];

        for (let i = 0; i < lineIndices.length; i += 2) {
            const startIdx = lineIndices[i] * 3;
            const endIdx = lineIndices[i + 1] * 3;
            lineVertices.push(
                vertices[startIdx], vertices[startIdx + 1], vertices[startIdx + 2],
                vertices[endIdx], vertices[endIdx + 1], vertices[endIdx + 2]
            );
        }

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineVertices), 3));

        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffffff, 
            transparent: true,
            opacity: 0.9,
            linewidth: isLarge ? 2 : 1
        });

        const wireframe = new THREE.LineSegments(lineGeometry, lineMaterial);
        scene.add(wireframe);

        // Add points
        const pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        const pointMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: isLarge ? 0.3 : (size === 'medium' ? 0.15 : 0.1),
            transparent: true,
            opacity: 0.8
        });
        
        const points = new THREE.Points(pointGeometry, pointMaterial);
        scene.add(points);

        // Add center cube (only for medium version)
        let cube = null;
        let cubeOutline = null;
        if (isMedium) {
            // Create cube geometry - make it bigger and more visible
            const cubeSize = 2.0 * scale; // Increased from 1.2
            const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
            
            // Create semi-transparent cube material
            const cubeMaterial = new THREE.MeshBasicMaterial({
                color: 0x4488ff,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide
            });
            
            cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
            cube.position.set(0, 0, 0); // Explicitly set position at center
            scene.add(cube);
            
            // Create cube outline
            const cubeOutlineGeometry = new THREE.EdgesGeometry(cubeGeometry);
            const cubeOutlineMaterial = new THREE.LineBasicMaterial({
                color: 0x88aaff,
                transparent: true,
                opacity: 0.8,
                linewidth: 2 // Make lines thicker
            });
            
            cubeOutline = new THREE.LineSegments(cubeOutlineGeometry, cubeOutlineMaterial);
            cubeOutline.position.set(0, 0, 0); // Explicitly set position at center
            scene.add(cubeOutline);
        }

        // Position camera - closer for smaller versions
        const cameraDistance = isLarge ? 15 : (size === 'medium' ? 13 : 10);
        camera.position.set(0, 10, cameraDistance);
        camera.lookAt(0, 0, 0);

        // Interaction variables
        let mouseX = 0, mouseY = 0, targetRotationX = 0, targetRotationY = 0;
        let shouldAutoRotate = autoRotate;
        let lastInteraction = Date.now();
        let isHoveringCube = false;
        
        // Touch interaction variables
        let isDragging = false;
        let previousTouchX = 0;
        let previousTouchY = 0;
        let touchStartTime = 0;

        // Gyroscope variables
        let gyroSupported = false;
        let gyroPermissionGranted = false;
        let gyroActive = false;
        let baseAlpha = null; // Initial orientation
        let baseBeta = null;
        let baseGamma = null;
        
        // Gyroscope sensitivity (lower = more sensitive)
        const gyroSensitivity = {
            alpha: 0.002, // Rotation around Z-axis (compass)
            beta: 0.003,  // Rotation around X-axis (front-to-back tilt)
            gamma: 0.003  // Rotation around Y-axis (left-to-right tilt)
        };

        // Raycaster for cube interaction (only for medium version)
        let raycaster = null;
        let mouse = new THREE.Vector2();
        
        if (isMedium) {
            raycaster = new THREE.Raycaster();
        }

        // Check if gyroscope is supported and request permission
        const initGyroscope = async () => {
            if (!gyroEnabled) return;
            
            // Check if DeviceOrientationEvent is supported
            if (typeof DeviceOrientationEvent !== 'undefined') {
                gyroSupported = true;
                
                // For iOS 13+ we need to request permission
                if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                    try {
                        const permission = await DeviceOrientationEvent.requestPermission();
                        if (permission === 'granted') {
                            gyroPermissionGranted = true;
                            setupGyroscope();
                        }
                    } catch (error) {
                        console.log('Gyroscope permission denied or error:', error);
                    }
                } else {
                    // Android or older iOS - permission not required
                    gyroPermissionGranted = true;
                    setupGyroscope();
                }
            }
        };

        const setupGyroscope = () => {
            if (!gyroSupported || !gyroPermissionGranted) return;
            
            // Add a small delay to avoid permission popup during page load
            setTimeout(() => {
                window.addEventListener('deviceorientation', handleDeviceOrientation, true);
                
                // Add visual indicator for gyroscope
                if (container.querySelector('.gyro-indicator')) return;
                
                const gyroIndicator = document.createElement('div');
                gyroIndicator.className = 'gyro-indicator';
                gyroIndicator.textContent = 'Tilt device to rotate';
                gyroIndicator.style.cssText = `
                    position: absolute;
                    bottom: 5px;
                    left: 5px;
                    font-size: 0.6rem;
                    color: rgba(255,255,255,0.3);
                    pointer-events: none;
                    z-index: 15;
                    transition: opacity 0.3s ease;
                `;
                container.appendChild(gyroIndicator);
                
                // Hide indicator after a few seconds
                setTimeout(() => {
                    gyroIndicator.style.opacity = '0';
                }, 5000);
            }, 1000);
        };

        const handleDeviceOrientation = (event) => {
            if (!gyroActive && event.alpha !== null && event.beta !== null && event.gamma !== null) {
                // Set baseline orientation on first reading
                baseAlpha = event.alpha;
                baseBeta = event.beta;
                baseGamma = event.gamma;
                gyroActive = true;
                return;
            }
            
            if (!gyroActive || baseAlpha === null) return;
            
            // Calculate relative orientation changes
            let deltaAlpha = event.alpha - baseAlpha;
            let deltaBeta = event.beta - baseBeta;
            let deltaGamma = event.gamma - baseGamma;
            
            // Handle 360-degree wrap-around for alpha
            if (deltaAlpha > 180) deltaAlpha -= 360;
            if (deltaAlpha < -180) deltaAlpha += 360;
            
            // Apply gyroscope rotation (subtle effect)
            const gyroRotationY = deltaAlpha * gyroSensitivity.alpha + deltaGamma * gyroSensitivity.gamma;
            const gyroRotationX = deltaBeta * gyroSensitivity.beta;
            
            // Combine with existing target rotation (mouse/touch has priority)
            if (Date.now() - lastInteraction > 1000) { // Only use gyro if no recent touch/mouse
                targetRotationY = gyroRotationY;
                targetRotationX = gyroRotationX;
                shouldAutoRotate = false;
            }
        };

        // Initialize gyroscope (but don't request permission immediately)
        if (gyroEnabled && /Mobi|Android/i.test(navigator.userAgent)) {
            // Only try to enable gyroscope on mobile devices
            initGyroscope();
        }

        // Add mouse interaction for all sizes
        const interactionElement = isLarge ? document : canvasContainer;
        
        const updateRotationFromCoordinates = (x, y) => {
            targetRotationY = x * Math.PI * 0.3;
            targetRotationX = y * Math.PI * 0.1;
            shouldAutoRotate = false;
            lastInteraction = Date.now();
            
            // Reset gyroscope baseline when user interacts
            if (gyroActive) {
                gyroActive = false;
                setTimeout(() => {
                    if (Date.now() - lastInteraction > 2000) {
                        gyroActive = false; // Will re-baseline on next gyro event
                    }
                }, 2000);
            }
        };

        const checkCubeHover = (x, y) => {
            if (isMedium && raycaster && cube) {
                mouse.x = x;
                mouse.y = y;
                
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(cube);
                
                if (intersects.length > 0) {
                    if (!isHoveringCube) {
                        isHoveringCube = true;
                        canvasContainer.style.cursor = 'pointer';
                        // Add glow effect
                        cube.material.opacity = 0.8;
                        cube.material.color.setHex(0x66aaff);
                        cubeOutline.material.opacity = 1;
                        cubeOutline.material.color.setHex(0xaaccff);
                    }
                } else {
                    if (isHoveringCube) {
                        isHoveringCube = false;
                        canvasContainer.style.cursor = 'default';
                        // Remove glow effect
                        cube.material.opacity = 0.5;
                        cube.material.color.setHex(0x4488ff);
                        cubeOutline.material.opacity = 0.8;
                        cubeOutline.material.color.setHex(0x88aaff);
                    }
                }
            }
        };

        const handleMouseMove = (event) => {
            if (isLarge) {
                mouseX = (event.clientX / window.innerWidth) * 2 - 1;
                mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
            } else {
                const rect = canvasContainer.getBoundingClientRect();
                mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            }
            
            checkCubeHover(mouseX, mouseY);
            updateRotationFromCoordinates(mouseX, mouseY);
        };

        const handleClick = (event) => {
            if (isMedium && isHoveringCube) {
                // Navigate to home page
                window.location.href = '/';
            }
        };

        // Touch event handlers
        const handleTouchStart = (event) => {
            event.preventDefault(); // Prevent scrolling
            
            const touch = event.touches[0];
            isDragging = true;
            touchStartTime = Date.now();
            
            if (isLarge) {
                previousTouchX = (touch.clientX / window.innerWidth) * 2 - 1;
                previousTouchY = -(touch.clientY / window.innerHeight) * 2 + 1;
            } else {
                const rect = canvasContainer.getBoundingClientRect();
                previousTouchX = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
                previousTouchY = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            }
            
            // Check if touching cube
            checkCubeHover(previousTouchX, previousTouchY);
        };

        const handleTouchMove = (event) => {
            if (!isDragging) return;
            event.preventDefault(); // Prevent scrolling
            
            const touch = event.touches[0];
            let currentTouchX, currentTouchY;
            
            if (isLarge) {
                currentTouchX = (touch.clientX / window.innerWidth) * 2 - 1;
                currentTouchY = -(touch.clientY / window.innerHeight) * 2 + 1;
            } else {
                const rect = canvasContainer.getBoundingClientRect();
                currentTouchX = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
                currentTouchY = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            }
            
            // Calculate rotation based on touch movement
            const deltaX = currentTouchX - previousTouchX;
            const deltaY = currentTouchY - previousTouchY;
            
            // Add rotation incrementally for smoother touch interaction
            targetRotationY += deltaX * Math.PI * 0.5;
            targetRotationX += deltaY * Math.PI * 0.2;
            
            // Update previous position
            previousTouchX = currentTouchX;
            previousTouchY = currentTouchY;
            
            shouldAutoRotate = false;
            lastInteraction = Date.now();
            
            // Reset gyroscope when actively touching
            if (gyroActive) {
                gyroActive = false;
            }
            
            // Check cube hover during drag
            checkCubeHover(currentTouchX, currentTouchY);
        };

        const handleTouchEnd = (event) => {
            event.preventDefault();
            
            // If it was a quick tap (not a drag) and we're hovering the cube, trigger click
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 200 && isMedium && isHoveringCube) {
                // Navigate to home page
                window.location.href = '/';
            }
            
            isDragging = false;
        };

        // Add event listeners
        interactionElement.addEventListener('mousemove', handleMouseMove);
        if (isMedium) {
            canvasContainer.addEventListener('click', handleClick);
        }

        // Touch event listeners
        canvasContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvasContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvasContainer.addEventListener('touchend', handleTouchEnd, { passive: false });

        // Triangle tips
        const triangleTips = [
            new THREE.Vector3(0, 0, -8 * scale),      // Top (position 0)
            new THREE.Vector3(8 * scale, 0, 0),       // Right (position 1)  
            new THREE.Vector3(0, 0, 8 * scale),       // Bottom (position 2)
            new THREE.Vector3(-8 * scale, 0, 0)       // Left (position 3)
        ];

        // Get labels
        const labels = container.querySelectorAll('.section-label');

        function updateLabelPositions() {
            const tempVector = new THREE.Vector3();
            const containerRect = canvasContainer.getBoundingClientRect();
            
            labels.forEach((label, index) => {
                if (index >= triangleTips.length) return;
                
                tempVector.copy(triangleTips[index]);
                tempVector.applyMatrix4(wireframe.matrixWorld);
                tempVector.project(camera);
                
                // Calculate position relative to the canvas container, not viewport
                const x = (tempVector.x * 0.5 + 0.5) * containerRect.width;
                const y = (tempVector.y * -0.5 + 0.5) * containerRect.height;
                
                // Smaller offsets for medium/small versions
                let offsetX = 0, offsetY = 0;
                const offsetScale = isLarge ? 1 : 0.8;
                if (index === 0) offsetY = -50 * offsetScale;      // Top
                else if (index === 1) offsetX = 60 * offsetScale;  // Right
                else if (index === 2) offsetY = 50 * offsetScale;  // Bottom
                else if (index === 3) offsetX = -60 * offsetScale; // Left
                
                label.style.left = (x + offsetX) + 'px';
                label.style.top = (y + offsetY) + 'px';
                label.style.display = 'block';
                label.style.opacity = tempVector.z < 1 ? '1' : '0.5';
            });
        }

        function animate() {
            requestAnimationFrame(animate);

            // Rotate cube if it exists
            if (cube && cubeOutline) {
                cube.rotation.x += 0.01;
                cube.rotation.y += 0.01;
                cubeOutline.rotation.x = cube.rotation.x;
                cubeOutline.rotation.y = cube.rotation.y;
            }

            if (shouldAutoRotate && Date.now() - lastInteraction > 2000 && !gyroActive) {
                wireframe.rotation.y += 0.005;
                points.rotation.y += 0.005;
            } else if (!shouldAutoRotate || Date.now() - lastInteraction <= 2000 || gyroActive) {
                wireframe.rotation.y += (targetRotationY - wireframe.rotation.y) * 0.05;
                wireframe.rotation.x += (targetRotationX - wireframe.rotation.x) * 0.05;
                points.rotation.y = wireframe.rotation.y;
                points.rotation.x = wireframe.rotation.x;
            }

            updateLabelPositions();
            renderer.render(scene, camera);
        }

        // Handle resize for large version
        if (isLarge) {
            window.addEventListener('resize', () => {
                const newWidth = window.innerWidth;
                const newHeight = window.innerHeight;
                camera.aspect = newWidth / newHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(newWidth, newHeight);
            });
        }

        animate();
    }, 100); // Small delay to ensure container is sized
}