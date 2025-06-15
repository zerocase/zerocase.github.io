// 3D Navigation JavaScript
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
    const isLarge = size === 'large';
    
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

        // Position camera - closer for smaller versions
        const cameraDistance = isLarge ? 15 : (size === 'medium' ? 13 : 10);
        camera.position.set(0, 10, cameraDistance);
        camera.lookAt(0, 0, 0);

        // Mouse interaction
        let mouseX = 0, mouseY = 0, targetRotationX = 0, targetRotationY = 0;
        let shouldAutoRotate = autoRotate;
        let lastInteraction = Date.now();

        // Add mouse interaction for all sizes
        const interactionElement = isLarge ? document : canvasContainer;
        
        const handleMouseMove = (event) => {
            if (isLarge) {
                mouseX = (event.clientX / window.innerWidth) * 2 - 1;
                mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
            } else {
                const rect = canvasContainer.getBoundingClientRect();
                mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            }
            
            targetRotationY = mouseX * Math.PI * 0.3;
            targetRotationX = mouseY * Math.PI * 0.1;
            shouldAutoRotate = false;
            lastInteraction = Date.now();
        };

        interactionElement.addEventListener('mousemove', handleMouseMove);

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

            if (shouldAutoRotate && Date.now() - lastInteraction > 2000) {
                wireframe.rotation.y += 0.005;
                points.rotation.y += 0.005;
            } else if (!shouldAutoRotate || Date.now() - lastInteraction <= 2000) {
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