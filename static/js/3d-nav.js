// 3D Navigation JavaScript with Touch and Gyroscope Support
document.addEventListener('DOMContentLoaded', function() {
    // Find all nav containers and initialize them
    const containers = document.querySelectorAll('.nav-3d-container');
    
    containers.forEach(container => {
        initNav3D(container);
    });
});

// Shortest signed distance from one angle to another, in (-PI, PI]. Rotations
// are 2*PI periodic, so settling toward a target by this delta takes the short
// way round instead of unwinding every turn the idle spin piled up.
function shortestAngleTo(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
}

// Fold an angle back into (-PI, PI]. Visually a no-op, it just stops a long
// idle spin from accumulating without bound.
function wrapAngle(angle) {
    return shortestAngleTo(0, angle);
}

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

        // Add center cube (for medium and large versions)
        let cube = null;
        let cubeOutline = null;

        // The cube is driven by an angular velocity that is continuously eased
        // back toward a slow idle drift. A click injects an impulse, so the spin
        // starts fast and settles back into the idle rotation without snapping.
        // The drift is ~26s per turn on Y and ~35s on X at 60fps: a slow tumble
        // rather than an attention-grabbing spin.
        const cubeIdleSpin = new THREE.Vector3(0.003, 0.004, 0);
        const cubeVelocity = cubeIdleSpin.clone();
        let cubeSpinEnergy = 0; // 1 right after a click, decays to 0
        let cubeGlow = 0;       // smoothed highlight, shared by hover and spin

        const cubeBaseColor = new THREE.Color(0x4488ff);
        const cubeHotColor = new THREE.Color(0x88ccff);
        const outlineBaseColor = new THREE.Color(0x88aaff);
        const outlineHotColor = new THREE.Color(0xe0f0ff);

        if (isMedium || isLarge) {
            // Create cube geometry - make it bigger and more visible
            const cubeSize = 2.0 * scale;
            const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

            // Lights only affect the cube; the wireframe and points use
            // materials that ignore them. Flat shading gives each face its own
            // tone so the cube reads as a solid object while it turns.
            scene.add(new THREE.AmbientLight(0x334466, 0.9));

            const keyLight = new THREE.DirectionalLight(0xbcd8ff, 0.9);
            keyLight.position.set(4, 8, 6);
            scene.add(keyLight);

            const rimLight = new THREE.DirectionalLight(0x4466cc, 0.6);
            rimLight.position.set(-5, -4, -6);
            scene.add(rimLight);

            const cubeMaterial = new THREE.MeshPhongMaterial({
                color: cubeBaseColor.clone(),
                emissive: cubeBaseColor.clone().multiplyScalar(0.15),
                specular: 0xbbddff,
                shininess: 60,
                flatShading: true,
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide
            });

            cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
            cube.position.set(0, 0, 0); // Explicitly set position at center
            scene.add(cube);

            // Create cube outline
            const cubeOutlineGeometry = new THREE.EdgesGeometry(cubeGeometry);
            const cubeOutlineMaterial = new THREE.LineBasicMaterial({
                color: outlineBaseColor.clone(),
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
        let pointerActive = false; // drives the labels' pull toward the cursor
        
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

        // Raycaster for cube interaction
        let raycaster = null;
        let mouse = new THREE.Vector2();
        
        if (isMedium || isLarge) {
            raycaster = new THREE.Raycaster();
        }

        // Function to trigger random cube spin
        const triggerRandomSpin = () => {
            if (!cube) return;

            // Always a decisive kick: a signed magnitude with a floor, so a
            // click can never land on a near-zero velocity and look ignored.
            const impulse = () => (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.16);

            // Additive, so clicking again mid-spin winds it up further rather
            // than being ignored. Capped so it cannot run away into a blur.
            const cap = 0.45;
            cubeVelocity.set(
                THREE.MathUtils.clamp(cubeVelocity.x + impulse(), -cap, cap),
                THREE.MathUtils.clamp(cubeVelocity.y + impulse(), -cap, cap),
                THREE.MathUtils.clamp(cubeVelocity.z + impulse(), -cap, cap)
            );
            cubeSpinEnergy = 1;
        };

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
            
            // Apply gyroscope rotation (subtle effect). Negated to match the
            // pointer: tilting toward a section brings that section forward.
            const gyroRotationY = -(deltaAlpha * gyroSensitivity.alpha + deltaGamma * gyroSensitivity.gamma);
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
            // Negative: the pointer pulls the nearest arm toward the viewer, so
            // moving right swings the RIGHT section forward instead of away.
            targetRotationY = -x * Math.PI * 0.3;
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
            if ((isMedium || isLarge) && raycaster && cube) {
                mouse.x = x;
                mouse.y = y;
                
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(cube);
                
                // Only track the state here; the highlight itself is applied
                // once per frame in animate() so hover and spin can't fight
                // over the cube's colours.
                if (intersects.length > 0) {
                    if (!isHoveringCube) {
                        isHoveringCube = true;
                        canvasContainer.style.cursor = 'pointer';
                    }
                } else {
                    if (isHoveringCube) {
                        isHoveringCube = false;
                        canvasContainer.style.cursor = 'default';
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
            
            mouse.set(mouseX, mouseY);
            pointerActive = true;

            checkCubeHover(mouseX, mouseY);
            updateRotationFromCoordinates(mouseX, mouseY);
        };

        // Let the cube drift back to centre once the pointer is gone
        const handlePointerLeave = () => {
            pointerActive = false;
        };

        const handleClick = (event) => {
            if ((isMedium || isLarge) && isHoveringCube) {
                if (isMedium) {
                    // Navigate to home page for medium version
                    window.location.href = '/';
                } else if (isLarge) {
                    // Trigger random spin for large version
                    triggerRandomSpin();
                }
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
            
            mouse.set(previousTouchX, previousTouchY);
            pointerActive = true;

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
            
            mouse.set(currentTouchX, currentTouchY);

            // Check cube hover during drag
            checkCubeHover(currentTouchX, currentTouchY);
        };

        const handleTouchEnd = (event) => {
            event.preventDefault();
            
            // If it was a quick tap (not a drag) and we're hovering the cube, trigger click
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration < 200 && (isMedium || isLarge) && isHoveringCube) {
                if (isMedium) {
                    // Navigate to home page for medium version
                    window.location.href = '/';
                } else if (isLarge) {
                    // Trigger random spin for large version
                    triggerRandomSpin();
                }
            }
            
            isDragging = false;
            pointerActive = false;
            isHoveringCube = false;
        };

        // Add event listeners
        interactionElement.addEventListener('mousemove', handleMouseMove);
        (isLarge ? document.documentElement : canvasContainer)
            .addEventListener('mouseleave', handlePointerLeave);
        if (isMedium || isLarge) {
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

        // Resting distance from the camera to each tip. Depth cues are measured
        // against this, so an untouched widget looks exactly as it does now and
        // only movement makes a section grow (nearer) or fade (further away).
        const restDistances = triangleTips.map(tip => camera.position.distanceTo(tip));

        // Fallback push direction per tip, used when a tip projects so close to
        // the centre that its radial direction would be unstable.
        const fallbackDirections = [
            [0, -1], // Top
            [1, 0],  // Right
            [0, 1],  // Bottom
            [-1, 0]  // Left
        ];

        // Wider than tall, matching the shape of the label boxes
        const offsetScale = isLarge ? 1 : 0.8;
        const padX = 60 * offsetScale;
        const padY = 50 * offsetScale;

        // Magnetic follow: a label leans toward the cursor once it comes within
        // this radius, and eases back to its anchor as the cursor moves away.
        // The pull is zero both at the radius edge and right on the label, so
        // labels greet the cursor on approach without dodging out from under it.
        const labelFollowRadius = isLarge ? 140 : 100;
        const labelFollowStrength = isLarge ? 60 : 42; // peaks at ~0.26x
        const labelFollow = Array.from(labels, () => ({ x: 0, y: 0 }));

        const tipWorld = new THREE.Vector3();
        const tipScreen = new THREE.Vector3();
        const centerScreen = new THREE.Vector3();

        function updateLabelPositions() {
            // Keep in step with this frame's rotation rather than the last one's
            wireframe.updateMatrixWorld();

            const containerRect = canvasContainer.getBoundingClientRect();

            centerScreen.set(0, 0, 0).project(camera);
            const centerX = (centerScreen.x * 0.5 + 0.5) * containerRect.width;
            const centerY = (centerScreen.y * -0.5 + 0.5) * containerRect.height;

            // Cursor in the same container-pixel space as the labels
            const pointerX = (mouse.x * 0.5 + 0.5) * containerRect.width;
            const pointerY = (mouse.y * -0.5 + 0.5) * containerRect.height;

            labels.forEach((label, index) => {
                if (index >= triangleTips.length) return;

                tipWorld.copy(triangleTips[index]).applyMatrix4(wireframe.matrixWorld);
                tipScreen.copy(tipWorld).project(camera);

                // Calculate position relative to the canvas container, not viewport
                const x = (tipScreen.x * 0.5 + 0.5) * containerRect.width;
                const y = (tipScreen.y * -0.5 + 0.5) * containerRect.height;

                // Push the label out along its own tip's direction so it stays
                // clear of the wireframe at any rotation.
                let dirX = x - centerX;
                let dirY = y - centerY;
                const dirLength = Math.hypot(dirX, dirY);
                if (dirLength > 1) {
                    dirX /= dirLength;
                    dirY /= dirLength;
                } else {
                    dirX = fallbackDirections[index][0];
                    dirY = fallbackDirections[index][1];
                }

                // > 1 when the section has swung toward the viewer, < 1 when away
                const proximity = restDistances[index] / camera.position.distanceTo(tipWorld);

                // Softened with a square root so text stays legible at the extremes
                const depthScale = Math.min(1.22, Math.max(0.82, Math.sqrt(proximity)));
                // Floored well above zero: these are nav links, they stay readable
                const depthFade = Math.min(1, Math.max(0.6, 1 - (1 - proximity) * 1.6));

                // Resting spot for this label, before any pull toward the cursor
                const anchorX = x + dirX * padX;
                const anchorY = y + dirY * padY;

                let pullX = 0, pullY = 0;
                if (pointerActive) {
                    const toPointerX = pointerX - anchorX;
                    const toPointerY = pointerY - anchorY;
                    const reach = Math.hypot(toPointerX, toPointerY);

                    if (reach > 0.5 && reach < labelFollowRadius) {
                        const t = reach / labelFollowRadius;
                        const falloff = (1 - t) * (1 - t) * (3 - 2 * (1 - t));
                        const pull = t * falloff * labelFollowStrength;
                        pullX = (toPointerX / reach) * pull;
                        pullY = (toPointerY / reach) * pull;
                    }
                }

                // Eased so the lean glides in and out rather than snapping
                const follow = labelFollow[index];
                follow.x += (pullX - follow.x) * 0.15;
                follow.y += (pullY - follow.y) * 0.15;

                label.style.left = (anchorX + follow.x) + 'px';
                label.style.top = (anchorY + follow.y) + 'px';
                label.style.setProperty('--depth-scale', depthScale.toFixed(3));
                label.style.opacity = depthFade.toFixed(3);
                // Nearer sections overlap further ones, staying in the label band
                label.style.zIndex = 10 + Math.round(proximity * 10);
                label.style.display = 'block';
            });
        }

        function animate() {
            requestAnimationFrame(animate);

            // Handle cube rotation and highlight
            if (cube && cubeOutline) {
                // Ease the angular velocity back toward the idle drift, so a
                // click spin winds down smoothly instead of snapping.
                cubeVelocity.lerp(cubeIdleSpin, 0.02);
                cube.rotation.x += cubeVelocity.x;
                cube.rotation.y += cubeVelocity.y;
                cube.rotation.z += cubeVelocity.z;
                cubeOutline.rotation.copy(cube.rotation);

                // Single highlight value shared by hover and spin
                cubeSpinEnergy *= 0.98;
                if (cubeSpinEnergy < 0.001) cubeSpinEnergy = 0;
                const glowTarget = Math.max(cubeSpinEnergy, isHoveringCube ? 1 : 0);
                cubeGlow += (glowTarget - cubeGlow) * 0.12;

                cube.material.color.copy(cubeBaseColor).lerp(cubeHotColor, cubeGlow);
                cube.material.emissive.copy(cubeBaseColor).multiplyScalar(0.15 + cubeGlow * 0.35);
                cube.material.opacity = 0.55 + cubeGlow * 0.3;
                cubeOutline.material.color.copy(outlineBaseColor).lerp(outlineHotColor, cubeGlow);
                cubeOutline.material.opacity = 0.8 + cubeGlow * 0.2;
            }

            if (shouldAutoRotate && Date.now() - lastInteraction > 2000 && !gyroActive) {
                // Wrapped each frame, so however long it idles the angle stays
                // in (-PI, PI] and there is never a pile of turns to undo.
                wireframe.rotation.y = wrapAngle(wireframe.rotation.y + 0.005);
                points.rotation.y = wireframe.rotation.y;
            } else {
                // Settle toward the pointer by the shortest arc: at most half a
                // turn, from wherever the idle spin left it.
                wireframe.rotation.y += shortestAngleTo(wireframe.rotation.y, targetRotationY) * 0.05;
                wireframe.rotation.x += shortestAngleTo(wireframe.rotation.x, targetRotationX) * 0.05;
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