// Event listener voor de "Upload en Start"-knop
document.getElementById('uploadButton').addEventListener('click', function() {
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload.files.length === 0) {
        alert('Selecteer a.u.b. een afbeelding.');
        return;
    }
    
    const fileReader = new FileReader();
    fileReader.onload = function(event) {
        // Verberg de upload interface en toon de legenda
        document.getElementById('uploadContainer').style.display = 'none'; 
        document.getElementById('info').style.display = 'block';
        document.getElementById('zoomControls').style.display = 'block';
        
        // Start de Three.js scene met de afbeelding als argument
        init(event.target.result);
    };
    fileReader.readAsDataURL(imageUpload.files[0]);
});

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
//import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

let scene, camera, renderer, controls;
let selectedObject;
let objModel, imagePlane; // Correct gebruik van globale variabelen
let boxHelper;
let clipboardObject = null; // Voor het tijdelijk opslaan van het gekopieerde object
let switchableObjects = []; // Lijst van objecten waartussen geschakeld kan worden
let currentIndex = -1; // Huidige index in de lijst van switchableObjects
let directionalLight; // Definieer directionalLight aan het begin van je script
let lightIndex = 0;
let newColor = 0;
let newTexturePath = 0;
let objects = [];
let lights = [];
let doekTeller = 0;
let kleurTeller = -1;
let kleurArray = [0xffffff, 0x80003a, 0x506432, 0xffc500, 0xb30019, 0xec410b, 0xffffff];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let isDragging = false;
let previousMousePosition = {
    x: 0,
    y: 0
};
let currentDirectionIndex = 0; // Begin met de eerste richting
const directions = ['Zuid', 'West', 'Noord', 'Oost']; // De mogelijke richtingen
// Beginwaarde voor de zoomfactor
let zoomFactor = 100; // 100% betekent geen zoom


function init(textureSrc) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 8;
    camera.position.y = 2;
    
// Parameters voor de orthografische camera
// left, right, top, bottom, near, far
//const aspect = window.innerWidth / window.innerHeight;
//const d = 20; // Een constante om de dimensie van het zichtveld te bepalen
//camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);

// Positie de camera voor een isometrisch perspectief
//camera.position.set(20, 20, 20); // Je kunt met deze waarden experimenteren om het beste zicht te krijgen
//camera.lookAt(scene.position); // Zorg ervoor dat de camera naar het midden van de scene kijkt

// Voeg je camera toe aan de scene, net zoals je met een PerspectiveCamera zou doen
scene.add(camera);

    // Toon de assen als hulplijnen
    const axesHelper = new THREE.AxesHelper(5); // De parameter specificeert de lengte van de assen
    scene.add(axesHelper); // Voeg x, y en z as zichtbaar toe
    
    // Hier initialiseer je de scene, camera, en renderer
    renderer = new THREE.WebGLRenderer({ alpha: false, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x000000, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);

    // GammaCorrectie instellen
    renderer.gammaOutput = true; // Verouderd in nieuwere Three.js versies, gebruik outputEncoding
    renderer.outputEncoding = THREE.sRGBEncoding; // Aanbevolen manier in nieuwere versies
    
    // Schaduw inschakelen
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Zachtere schaduwen
    
    
    // Nadat de renderer is gedefinieerd, voeg je het domElement toe aan de canvasContainer
    document.getElementById('canvasContainer').appendChild(renderer.domElement);
    document.getElementById('canvasContainer').style.display = 'block';
    
    function addEventListeners() {
        renderer.domElement.addEventListener('mousedown', onMouseDown, false);
        renderer.domElement.addEventListener('mousemove', onMouseMove, false);
        window.addEventListener('mouseup', onMouseUp, false);
        controls.enabled = true;
    }
    
    let dragPlane = new THREE.Plane();
    let dragOffset = new THREE.Vector3();
    
    function onMouseDown(event) {
        event.preventDefault();
        
        mouse.x = ((event.clientX - renderer.domElement.offsetLeft) / renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - renderer.domElement.offsetTop) / renderer.domElement.clientHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        let intersects = raycaster.intersectObjects(scene.children, true);
        
        if (intersects.length > 0) {
            let target = intersects[0].object;
            
            // Reset selectedObject elke keer als de muis wordt ingedrukt
            selectedObject = null;
            
            while (target.parent) {
                target = target.parent;
                if (switchableObjects.includes(target)) {
                    selectedObject = target;
                    break; // Stop de lus als het juiste object is gevonden
                }
            }
            
            if (selectedObject) {
                controls.enabled = false;
                isDragging = true;
                
                dragPlane.setFromNormalAndCoplanarPoint(
                    camera.getWorldDirection(dragPlane.normal),
                    selectedObject.position
                );
                
                if (raycaster.ray.intersectPlane(dragPlane, dragOffset)) {
                    dragOffset.sub(selectedObject.position);
                }
                
                // Update de bounding box hier indien nodig
                updateBoundingBox();
            } else {
                // Als de klik niet op een switchableObjects is, deselecteer dan
                controls.enabled = true;
                selectedObject = null;
                // Verwijder de bounding box hier indien nodig
                removeBoundingBox();
            }
        } else {
            // Geen intersecties, dus zet de controls aan en deselecteer het object
            controls.enabled = true;
            selectedObject = null;
            // Verwijder de bounding box hier indien nodig
            removeBoundingBox();
        }
    }
    
    function onMouseMove(event) {
        if (!isDragging || !selectedObject) return;
        
        mouse.x = ((event.clientX - renderer.domElement.offsetLeft) / renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - renderer.domElement.offsetTop) / renderer.domElement.clientHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        
        let intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
            let newPosition = intersectPoint.sub(dragOffset);
            // Behoud de oorspronkelijke z-positie
            newPosition.z = selectedObject.position.z;
            selectedObject.position.copy(newPosition);
            updateBoundingBox(); // Update de BoxHelper om het geselecteerde object
        }
    }
    
    function onMouseUp() {
        if (isDragging) {
            isDragging = false;
            controls.enabled = true; // Heractiveer OrbitControls
        }
    }
    
    controls = new OrbitControls(camera, renderer.domElement);
    //controls.enableDamping = true;
    //controls.dampingFactor = 0.05;

    //const PCDloader = new PCDLoader();
    //PCDloader.load('pcd/frame_00186.pcd', function (points) {
    //    scene.add(points);
    //    render();
    //});
    
    
    // Zorg ervoor dat je deze functieaanroep toevoegt binnen je init() functie
    addEventListeners();
    
    // Hier voeg je de belichting toe
    addLighting();

    // Hier definiëren we assetsLoaded binnen de scope van init, om te zorgen voor juiste toegankelijkheid
    let assetsLoaded = 0; // Zorg ervoor dat deze variabele toegankelijk is binnen de scope van init
    
    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();
    const textureLoader = new THREE.TextureLoader();

    // Maak een nieuw Image element voor de geüploade afbeelding
    const image = new Image();
    image.src = textureSrc; // Stel de data-URL in als de bron van de afbeelding
    image.onload = function() {
        // Wanneer de afbeelding geladen is, creëer dan de textuur
        const texture = new THREE.Texture(image);
        texture.needsUpdate = true; // Zorg ervoor dat Three.js weet dat de textuur geüpdatet moet worden
        
        // Verbeter de kwaliteit en helderheid van de foto
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        
        
        // Gebruik deze textuur voor je materiaal
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.5, // Aanpassen voor minder weerspiegeling
            metalness: 0.1  // Aanpassen voor minder metallic look

            });
        
        // Creëer de geometrie en mesh zoals gebruikelijk
        const geometry = new THREE.PlaneGeometry(15, 10);
        imagePlane = new THREE.Mesh(geometry, material);
        imagePlane.geometry.computeBoundingSphere();
        //const size = mesh.geometry.boundingBox.getSize();
        imagePlane.position.x = 0;
        imagePlane.receiveShadow = true; // Laat het afbeeldingsvlak schaduwen ontvangen
        scene.add(imagePlane);

        //switchableObjects.push(imagePlane);
        
        checkAllAssetsLoaded(); // Roep deze functie aan na het laden van elke asset
    };
    


    // MTL Loader
    mtlLoader.load('obj/zonnescherm.mtl', (materials) => {
    materials.preload();
    
        // OBJ model laden
        objLoader.setMaterials(materials);
        objLoader.load('obj/zonnescherm.obj', function(object) {
            object.scale.setScalar(1);
            objModel = object;
            
            object.traverse(function(child) {
                if (child.isMesh && child.material) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Voor 'Doek_Boven' materiaal
                    if (child.material.name === "wire_227153153") {
                        // Gebruik MeshStandardMaterial voor een realistischer uiterlijk
                        let stofTexture = new THREE.TextureLoader().load('obj/doek1.jpg');
                        child.material = new THREE.MeshStandardMaterial({
                            name: "Doek_Boven",
                            map: stofTexture, // Textuur voor het 'stof'-achtige uiterlijk
                            roughness: 0.9, // Stof is meestal niet glanzend, dus een hoge roughness waarde
                            metalness: 0.1, // Stof heeft minimale tot geen metallic eigenschappen
                        });
                    }

                    // Voor 'Doek_Onder' materiaal
                    else if (child.material.name === "building_02_Door__Window_blind__Nor") {
                        // Gebruik MeshStandardMaterial voor een realistischer uiterlijk
                        let stofTexture = new THREE.TextureLoader().load('obj/doek1b.jpg');
                        child.material = new THREE.MeshStandardMaterial({
                            name: "Doek_Onder",
                            map: stofTexture, // Textuur voor het 'stof'-achtige uiterlijk
                            roughness: 0.9, // Stof is meestal niet glanzend, dus een hoge roughness waarde
                            metalness: 0.1, // Stof heeft minimale tot geen metallic eigenschappen
                        });
                    }

                    // Voor 'Frame' materiaal
                    else if (child.material.name === "Frame") {
                        let ijzerTexture = new THREE.TextureLoader().load('obj/metallic-textured-background.jpg');
                        child.material = new THREE.MeshStandardMaterial({
                            name: "Frame",
                            map: ijzerTexture, // Textuur voor het 'ijzer'-achtige uiterlijk
                            roughness: 0.3, // IJzer heeft een lagere roughness, wat zorgt voor wat glans
                            metalness: 1.0, // IJzer is een metaal, dus metalness is hoog
                        });
                    }
                    
                    // Vergeet niet needsUpdate te zetten indien nodig
                    child.material.needsUpdate = true;
                }
            });
            
            scene.add(objModel);
            objModel.receiveShadow = true;
            objModel.position.x = 0;
            switchableObjects.push(objModel);
            
            checkAllAssetsLoaded(); // En hier weer
        });
    });
    
function checkAllAssetsLoaded() {
        assetsLoaded++;
        if (assetsLoaded === 2) {
            // Wanneer beide assets geladen zijn, kunnen we selectedObject instellen
            selectedObject = switchableObjects[0]; // Begin met de imagePlane geselecteerd
            updateBoundingBox();
        }
    }
    
    document.getElementById('canvasContainer').style.display = 'block';
    document.getElementById('canvasContainer').appendChild(renderer.domElement);
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onDocumentKeyDown, false);
    
    animate();
}

function changeColorSpecificMaterials(materialColors) {
    objModel.traverse(function(child) {
        if (child.isMesh) {
            let materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(material => {
                // Vind het kleurobject voor het huidige materiaal, indien aanwezig
                const materialColorObject = materialColors.find(m => m.name === material.name);
                if (materialColorObject) {
                    material.map = null; // Verwijder de textuur
                    material.color.set(materialColorObject.color); // Zet de kleur van de specifieke materiaalnaam
                    material.needsUpdate = true;
                }
            });
        }
    });
}


function changeTexture(materialTextures) {
    const textureLoader = new THREE.TextureLoader();
    
    materialTextures.forEach(materialTexture => {
        textureLoader.load(materialTexture.texturePath, newTexture => {
            objModel.traverse(child => {
                if (child.isMesh) {
                    let materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(material => {
                        if (material.name === materialTexture.name) {
                            material.color.set(0xffffff); 
                            material.map = newTexture;
                            material.needsUpdate = true;
                        }
                    });
                }
            });
        });
    });
}

function addLighting() {
    // Ambient Light toevoegen
    const ambientLight = new THREE.AmbientLight(0xDDEEFF, 0.7);
    scene.add(ambientLight);
    lights.push(ambientLight);
        
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
    lights.push(hemiLight);
    
    directionalLight = new THREE.DirectionalLight(0xFFF6E5, 1);
    directionalLight.position.set(5, 10, 5); // Aangepast voor een meer diagonale zonlichtinval
    directionalLight.castShadow = true; // Schaduwen werpen inschakelen
    scene.add(directionalLight);
    lights.push(directionalLight);
    
    // Schaduwkwaliteit verbeteren
    directionalLight.shadow.mapSize.width = 4096; // Hogere resolutie schaduwmap
    directionalLight.shadow.mapSize.height = 4096; // Hogere resolutie schaduwmap
    directionalLight.shadow.camera.near = 0.5; // Naderbij de near clip van de schaduwcamera
    directionalLight.shadow.camera.far = 500; // Verderaf de far clip van de schaduwcamera
    
    // Toon waar het licht vandaan komt
    const shadowCameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    scene.add(shadowCameraHelper);
    
    // Meer lichtbronnen hier toevoegen volgens behoefte
    // Bijvoorbeeld PointLight, SpotLight, etc.
}

function switchLighting(trigger) {
    if (trigger === "all") {
        // Als "all" wordt meegegeven, zet dan alle lichten aan
        lights.forEach((light) => {
            light.visible = true;
        });
    } else {
    // Huidig licht uitzetten
    lights[lightIndex].visible = false;
    
    // Naar het volgende licht gaan
    lightIndex = (lightIndex + 1) % lights.length;
    
    // Huidig licht uitzetten
    lights[lightIndex].visible = false;
    
    // Naar het volgende licht gaan
    lightIndex = (lightIndex + 1) % lights.length;
    
    // Nieuw licht aanzetten
    lights[lightIndex].visible = true;
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function exportSceneAsImage() {
    // Renderer uitlezen naar een Data URL
    var imgData, imgNode;
    try {
        var strMime = "image/jpg";
        imgData = renderer.domElement.toDataURL(strMime);
                
        // Maak een link en klik er programmatisch op om de afbeelding te downloaden
        var link = document.createElement('a');
        if (typeof link.download === 'string') {
            document.body.appendChild(link); // Firefox vereist dat de link deel uitmaakt van het document
            link.download = 'scene.jpg';
            link.href = imgData;
            link.click();
            document.body.removeChild(link); // Verwijder de link wanneer het niet meer nodig is
        } else {
            location.replace(uri);
        }
    } catch (e) {
        console.error(e);
        return;
    }
}

function updateBoundingBox() {
    // Verwijder de oude BoxHelper als deze bestaat
    if (boxHelper) {
        scene.remove(boxHelper);
        boxHelper = undefined;
    }
    
    // Controleer of er een geselecteerd object is
    if (selectedObject) {
        // Maak een nieuwe BoxHelper voor het geselecteerde object
        boxHelper = new THREE.BoxHelper(selectedObject, 0xffff00); // Geel als kleurvoorbeeld
        scene.add(boxHelper);
    }
}

function removeBoundingBox() {
    if (boxHelper) {
        // Maak de boxHelper onzichtbaar of verwijder deze
        scene.remove(boxHelper);
        boxHelper = null;
    }
}

function changeLightDirection(direction) {
    let targetPosition = new THREE.Vector3(0, 0, 0); // Stel dit in op de positie van je focuspunt in de scene
    
    switch(direction) {
        case 'Zuid':
            directionalLight.position.set(0, 10, 10);
            break;
        case 'West':
            directionalLight.position.set(-10, 10, 0);
            break;
        case 'Noord':
            directionalLight.position.set(0, 10, -10);
            break;
        case 'Oost':
            directionalLight.position.set(10, 10, 0);
            break;
    }
    
    directionalLight.target.position.copy(targetPosition); // Richt het licht
    directionalLight.target.updateMatrixWorld();
}

function updateZoomPercent() {
    document.getElementById('zoomPercent').value = `${zoomFactor}%`;
}

document.getElementById('zoomIn').addEventListener('click', function() {
    zoomFactor += 1; // Verhoog de zoomfactor met 1% bij inzoomen
    camera.position.z *= 0.99; // Pas deze factor aan om de zoomsnelheid te wijzigen
    updateZoomPercent();
});

document.getElementById('zoomOut').addEventListener('click', function() {
    zoomFactor -= 1; // Verlaag de zoomfactor met 1% bij uitzoomen
    camera.position.z /= 0.99; // Pas deze factor aan om de zoomsnelheid te wijzigen
    updateZoomPercent();
});

document.getElementById('zoomReset').addEventListener('click', function() {
    const zoomPercentInput = document.getElementById('zoomPercent').value;
    const percent = parseInt(zoomPercentInput, 10);
    if (!isNaN(percent) && percent > 0) {
        zoomFactor = percent;
        // Stel hier de originele camera-afstand in; pas deze waarde aan naar je standaard camera-z
        const originalDistance = 8; // Voorbeeldafstand
        camera.position.z = originalDistance * (100 / percent);
    } else {
        // Stel de camera opnieuw in op de standaardafstand als de input ongeldig is
        camera.position.z = 8; // Voorbeeldafstand
        zoomFactor = 100; // Reset naar 100% zoom
    }
    updateZoomPercent();
});

// Initialiseer het zoompercentage wanneer de pagina laadt
updateZoomPercent();


function onDocumentKeyDown(event) {
    let stepSize = event.shiftKey ? 0.05 : 0.01; // Grotere stap als Shift is ingedrukt
    switch (event.key) {
        case 's':
            if (switchableObjects.length > 0) {
                currentIndex = (currentIndex + 1) % switchableObjects.length; // Ga naar het volgende object, met looping
                selectedObject = switchableObjects[currentIndex];
                updateBoundingBox();
            }
            break;
        case 'c':
            if (selectedObject) {
                clipboardObject = selectedObject.clone();
            }
            break;
        case 'v':
            if (clipboardObject) {
                const objectClone = clipboardObject.clone();
                scene.add(objectClone);
                objectClone.position.x += 1; // Pas de positie enigszins aan
                
                // Voeg het gekloonde object toe aan switchableObjects en maak het het geselecteerde object
                switchableObjects.push(objectClone);
                selectedObject = objectClone;
                updateBoundingBox();
                currentIndex = switchableObjects.length - 1; // Update de huidige index naar het nieuw toegevoegde object
            }
            break;
        case '+': // Voor schaalvergroting met '+' (gebruikers moeten 'Shift+ =' drukken)
            if (selectedObject) {
                selectedObject.scale.x *= 1.01;
                selectedObject.scale.y *= 1.01;
                selectedObject.scale.z *= 1.01;
            }
            updateBoundingBox();
            break;
        case '-': // Voor schaalverkleining
            if (selectedObject) {
                selectedObject.scale.x *= 0.99;
                selectedObject.scale.y *= 0.99;
                selectedObject.scale.z *= 0.99;
            }
            updateBoundingBox();
            break;
        case 'l':
            switchLighting();
            break;
        case 'L':
            switchLighting("all");
            break;
        case 'w':
            if (selectedObject) selectedObject.scale.x *= 0.99;
            updateBoundingBox();
            break;
        case 'W':
            if (selectedObject) selectedObject.scale.x *= 1.01;
            updateBoundingBox();
            break;
        case 'k':
            kleurTeller++; // Verhoog de teller met 1
            if (kleurTeller > 4) kleurTeller = 0;
            newColor = kleurArray[kleurTeller];
            changeColorSpecificMaterials([
                { name: 'Doek_Boven', color: newColor }, 
                { name: 'Doek_Onder', color: newColor }  
            ]);            
            break;
        case 't':
            doekTeller++; // Verhoog de teller met 1
            if (doekTeller > 5) doekTeller = 1;
                if (doekTeller == 1) {
                    changeTexture([
                        { name: 'Doek_Boven', texturePath: 'obj/doek' + doekTeller + '.jpg' },
                        { name: 'Doek_Onder', texturePath: 'obj/doek' + doekTeller + 'b.jpg' }
                    ]);
                } else {
                    changeTexture([
                        { name: 'Doek_Boven', texturePath: 'obj/doek' + doekTeller + '.jpg' },
                        { name: 'Doek_Onder', texturePath: 'obj/doek' + doekTeller + '.jpg' }
                    ]);
                }
            break;
        case 'r':
            // Roteer 1 graad naar rechts
            imagePlane.rotation.z -= Math.PI / 180; // 1 graad naar rechts
            updateBoundingBox();
            break;
        case 'R':
            // Roteer 1 graad naar links
            imagePlane.rotation.z += Math.PI / 180; // 1 graad naar links
            updateBoundingBox();
            break;
                
        case 'p':
            exportSceneAsImage();
            break;
        case 'q':
            document.getElementById('info').style.display = 'none';
            break;
        case 'Q':
            document.getElementById('info').style.display = 'block';
            break;
        case 'Z':
            // Roep de changeLightDirection functie aan met de huidige richting
            changeLightDirection(directions[currentDirectionIndex]);
            // Update de index voor de volgende richting, loop terug naar 0 als we het einde van de array bereiken
            currentDirectionIndex = (currentDirectionIndex + 1) % directions.length;
            break;
        case 'ArrowUp':
            if (selectedObject) selectedObject.position.y += stepSize;
            updateBoundingBox();
            break;
        case 'ArrowDown':
            if (selectedObject) selectedObject.position.y -= stepSize;
            updateBoundingBox();
            break;
        case 'ArrowLeft':
            if (selectedObject) selectedObject.position.x -= stepSize;
            updateBoundingBox();
            break;
        case 'ArrowRight':
            if (selectedObject) selectedObject.position.x +=stepSize;
            updateBoundingBox();
            break;
    }
}

//init();


