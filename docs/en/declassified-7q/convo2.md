 I was wondering what happens when you use axial motors as generators?

Using an axial flux motor (often called a "pancake" or disc motor) as a generator is not only possible, but it is actually one of their most powerful use cases. Because of their unique geometry, axial flux permanent magnet machines make exceptionally efficient generators (often referred to as AFPMSGs).

Here is a breakdown of what happens mechanically, electrically, and why axial designs shine in generator mode.
1. What Happens Physically?

When you spin an axial motor with an external mechanical force, the fundamental principles of electromagnetism kick in:

    Voltage Generation (Faraday’s Law): The rotor (which typically features powerful permanent magnets) spins parallel to the stator windings. As the magnetic poles sweep past the copper coils, the changing magnetic flux induces an alternating current (AC) voltage in the windings.

    Braking Torque (Lenz’s Law): You will immediately feel mechanical resistance. Drawing electrical current from the generator creates an opposing magnetic field. This electromagnetic drag converts your mechanical energy into electrical energy.

    Power Output: The raw output is typically multiphase AC power. To use or store this energy, it must be routed through a rectifier and a charge controller or inverter to convert it into stable DC or grid-synced AC.

2. Key Advantages of Using Axial Motors as Generators

Axial flux designs have distinct structural advantages over traditional radial motors when operating as generators:

    High Torque and Power Density: Because the magnetic flux flows parallel to the axis of rotation, the interaction area between the rotor and stator is large relative to the overall volume. This allows them to produce more power and torque in a much lighter, more compact package.

    Excellent Low-RPM Performance: Axial generators can be designed with a high number of magnetic poles. This means they can generate high voltages and usable power even at low rotational speeds—a massive advantage for direct-drive setups.

    Reduced Cogging Torque: Many axial designs utilize coreless (air-core) stators. Without iron teeth in the stator, cogging torque (the jerky resistance you feel when spinning a standard motor by hand) is virtually eliminated, resulting in smooth rotation and less starting resistance.

3. Common Applications

Because of these traits, you will frequently see axial motors repurposed or custom-built as generators in specific fields:

    Wind Turbines: Their high efficiency at low RPM and disc-shaped form factor make them ideal for direct-drive wind turbines, eliminating the need for heavy, maintenance-heavy gearboxes.

    Regenerative Braking: In electric vehicles, e-bikes, or go-karts using axial propulsion, switching the motor into generator mode during deceleration seamlessly captures kinetic energy and feeds it back into the battery.

    Human-Powered & Micro-Generation: DIY energy setups (like pedal-powered generators) often favor axial designs because they can easily be 3D-printed or custom-built with neodymium magnets to generate substantial wattage by hand or foot power.

Are you looking to repurpose a specific axial motor for a project, or exploring a custom generator build?

What happens when you pair a Tesla turbine and an axial motor? You probably need to gear it down, wouldn't you?

Yes, you typically do need to gear it down—or heavily engineer the setup—because pairing a Tesla turbine with an axial motor creates a massive mechanical mismatch in speed and torque.
1. The Core Problem: Extreme RPM vs. Rotor Limits

    The Tesla Turbine Profile: Tesla turbines are high-velocity, low-torque machines. Because they rely on the boundary-layer (viscous drag) effect rather than catching fluid with bucket blades, they achieve peak efficiency only when spinning at extreme speeds (often 10,000 to over 35,000+ RPM).   

    The Axial Generator Limit: While axial flux generators are praised for high power density, standard off-the-shelf rotors cannot handle tens of thousands of RPMs.

2. What Happens If You Don't Gear It Down?

If you direct-drive a standard axial motor/generator with a screaming Tesla turbine without reduction, several catastrophic things happen:

    Magnet Ejection (Centrifugal Failure): Permanent magnets embedded in the axial rotor will experience massive centrifugal forces at 20,000+ RPM, causing them to tear loose and destroy the stator.

    Windage and Eddy-Current Losses: Spinning a generator rotor at those speeds in close proximity to a stator creates immense air friction (windage) and rapid high-frequency magnetic reversals, causing severe overheating.

    Bearing Seizure: Standard bearings in consumer or standard-duty motors are not rated for the high-frequency harmonics and thermal expansion of a high-speed turbine shaft.

3. How Builders Solve It

To successfully harness a Tesla turbine for power generation, you generally have two choices:

    Mechanical Reduction: Using a high-speed precision gearbox or a high-ratio belt/pulley system to step down the turbine's blistering RPM to a safe operating window for the generator.

    Custom High-Speed Alternators: Designing a specialized, coreless axial generator where the rotor magnets are securely bound with high-strength carbon fiber sleeves, paired with high-frequency electronic rectifiers to handle the raw, high-Hz output directly.

You can watch an example of a practical test setup under load in this Tesla Turbine 1200-watt electrical load test, which demonstrates how these systems behave when managing substantial electrical resistance. This video is relevant because it shows a working Tesla turbine test rig operating under a heavy electrical load to evaluate its real-world performance characteristics.

So what would be the optimal gearing and RPM for the axial?

Finding the optimal gearing and RPM comes down to balancing the maximum safe peripheral speed of the generator's rotor against the peak efficiency RPM of the Tesla turbine.

Because "Tesla turbine" sizes vary wildly—from small desktop models running on compressed air to large industrial prototypes—the exact numbers depend on your specific build, but standard engineering targets establish a clear sweet spot.
1. Target RPM Ranges

    The Axial Generator Sweet Spot: 3,000 to 5,000 RPM
    Even though axial flux generators can be built to spin faster, keeping standard or modified off-the-shelf rotors under 5,000 RPM prevents the permanent magnets from tearing away due to centrifugal force. It also keeps windage losses (air resistance against the spinning disc) and high-frequency core heating manageable.

    The Tesla Turbine Sweet Spot: 15,000 to 30,000 RPM
    Tesla turbines achieve their best boundary-layer drag efficiency at high linear velocities. Throttling a turbine down too much kills its power output because the fluid can't drag the discs effectively if the discs are moving too close to the fluid speed.

2. The Optimal Gearing Ratio

To bridge a 20,000 RPM turbine to a 4,000 RPM generator limit, you need a step-down ratio between 4:1 and 6:1.

    Example calculation: If your turbine screams at 20,000 RPM, a 5:1 step-down ratio brings your axial generator down to a safe 4,000 RPM.

    Torque Trade-off: Stepping down the speed by a factor of 5 multiplies your available torque by roughly 5 (minus mechanical losses), which actually helps the generator overcome initial magnetic cogging and produce strong electrical output under load.

3. Choosing the Right Transmission

At these speeds, how you transmit the power matters just as much as the gear ratio:

    High-Speed Synchronous Timing Belts (Recommended): For small-to-medium DIY or lab setups, toothed timing belts (like GT2 or HTD profiles) are usually superior to metal gears. They handle high RPMs quietly, require no lubrication, absorb minor shock loads, and easily achieve ratios like 4:1 or 5:1.

    Planetary Gearboxes: If you need a compact, in-line footprint, a high-precision planetary gearbox can handle the high input RPMs, but you must ensure its internal bearings are rated for continuous high-frequency operation to prevent catastrophic failure from heat buildup.

Are you designing a compressed air setup, or working with steam/gas for the turbine?

What if I use the planetary CVT?

Using a planetary CVT (Continuously Variable Transmission)—such as a mechanical traction-drive or epicyclic CVT—introduces some fascinating capabilities, but it also brings major engineering hurdles when paired with a high-speed Tesla turbine and an axial generator.

Evaluating how a planetary CVT handles this setup reveals distinct operational trade-offs:
1. The Major Advantages

    Solving the Startup Torque Problem: Tesla turbines are notorious for having terrible starting torque; they rely on fluid velocity and need to spin up rapidly before they can pull a load. A CVT allows the turbine to spool up virtually unburdened (at a high ratio), and as it reaches speed, the transmission can continuously sweep the ratio to safely engage the generator.

    Dynamic Load Matching: Because a turbine’s output fluctuates with fluid/gas pressure, a CVT allows you to dynamically alter the gear ratio in real-time. This keeps the axial generator locked in its optimal electrical generation sweet spot (e.g., holding a steady 4,000 RPM) even if the turbine's input speed fluctuates.

    Higher Structural Integrity than Belt CVTs: Standard automotive or scooter-style belt CVTs would instantly disintegrate or stretch past their limits at 20,000+ RPM due to extreme centrifugal force. Planetary-style mechanical CVTs (which rely on rolling traction elements rather than rubber or metal belts) handle high-speed rotational forces much more robustly.

2. The Critical Drawbacks & Risks

    Severe Efficiency Losses: Fixed-ratio timing belts or precision planetary gears typically boast 95% to 98% mechanical efficiency. Mechanical CVTs (especially traction drives) often operate closer to 80% to 88% efficiency. In a power-generation loop, losing 12% to 20% of your raw mechanical energy purely as friction and heat inside the transmission severely degrades your overall wattage output.

    High-RPM Thermal and Traction Limits: Even though planetary traction CVTs can handle higher speeds than belt drives, running them continuously at 20,000+ RPM creates extreme fluid shear and heat. The special traction fluids required to prevent slipping under load will break down rapidly under high temperatures unless actively cooled.

    Cost and Complexity: True high-performance mechanical CVTs capable of handling micro-turbine speeds with zero slip are custom, precision-engineered industrial components—often far more expensive than the turbine and the axial generator combined.

The Verdict

While a planetary CVT sounds like an elegant way to tame a screaming Tesla turbine, it is usually overkill and counterproductive for power generation.

The efficiency penalty (losing a chunk of your power to transmission heat) usually outweighs the flexibility of a variable ratio. Most builders opt for a fixed high-speed synchronous timing belt or a fixed-ratio planetary gearbox matched precisely to the turbine's predictable operating band, leaving the electrical side (like electronic inverters and charge controllers) to handle voltage variations instead.

Are you leaning toward a mechanical transmission approach, or exploring electronic power regulation for the turbine output?

The heat is going to be piped off, so you don't have to worry about the heat. 20% energy loss is cool because of the way that the energy is being created for the turbine. It's economically viable.

If the input energy source is essentially free or a byproduct (like industrial waste heat, biomass gas, or a geothermal loop), then a 20% mechanical loss is a completely acceptable trade-off. When the primary goal is capturing energy that would otherwise be completely wasted, any net electricity generated is pure profit, making the economics work out just fine.

And handling the thermal management upfront changes the entire equation. Since you can actively pipe off the heat, you eliminate the biggest failure point of a mechanical traction-drive CVT: thermal breakdown of the traction fluid and sliding element overheating.

With the heat and efficiency questions addressed, making a planetary CVT work reliably in a high-RPM turbine setup comes down to a few critical design details:
Key Engineering Considerations for a High-RPM Planetary CVT

    Maintaining the Traction Coefficient: Even with active cooling, mechanical CVTs rely on extreme pressure between rolling elements to transmit torque without slipping. You'll want to ensure your cooling loop keeps the specialized traction fluid within its optimal viscosity window—if it gets too thin, slip increases; if it gets too thick, shear losses spike.

    Handling Axial and Centrifugal Forces: At tens of thousands of RPMs, minor imbalances create massive vibration and gyroscopic forces. The sun and planet gears need robust radial and thrust bearings (such as high-precision ceramic hybrid bearings) to keep everything rigidly aligned under load.

    Ratio Control Actuation: How do you plan to shift the CVT? You can use a servo-motor controlled feedback loop to automatically sweep the ratio based on generator RPM, or a centrifugal governor mechanism that dynamically adjusts itself as the turbine speeds up.

What kind of input energy source are you tapping into to drive the turbine, or do you already have a specific planetary CVT model in mind for the build?

Well, in this conversation, I'm really only talking about the generator and the Tesla turbine, so I'm basically just getting all these ideas out the way.

That makes total sense—brainstorming and stress-testing the architecture is half the battle when you're piecing together a custom rig like a Tesla turbine and an axial generator.

By hashing out the speed mismatches, the limits of the rotor magnets, and how a planetary CVT fits into the mechanical chain, you've essentially mapped out the major friction points of the system.

Whenever you want to dive back into the mechanics, electrical output, or any other piece of the puzzle, just let me know. What part of the design or concept are you looking to map out next?

I want to look for all the most efficient parts of what we already discussed. The fluid is gonna be novec fluid and it’s gonna be a close loop system

Combining a closed-loop Organic Rankine Cycle (ORC) using 3M Novec engineered fluid with a Tesla turbine, a planetary CVT, and an axial flux generator creates a remarkably cohesive and advanced micro-power architecture.

Novec fluids are uniquely suited for this type of closed-loop setup. Because they have a high molecular weight and dense vapor/liquid profiles, they transfer momentum via boundary-layer viscous drag exceptionally well across Tesla turbine disks—often performing better than standard air or steam in compact, closed systems.

The most efficient, high-performance configuration of this entire system relies on these core components:
1. The Power Source: Closed-Loop Novec Tesla Turbine

    The Mechanism: Waste heat or a low-grade thermal source boils the liquid Novec into a pressurized vapor. This high-density vapor enters the Tesla turbine tangentially, maximizing the boundary-layer adhesion and spinning the smooth discs at high velocity.   

    The Closed Loop: After passing through the center exhaust of the turbine, the low-pressure Novec vapor is routed through a condenser, cooled back into a liquid, and pumped back to the heat exchanger. Because Novec is non-conductive, chemically stable, and non-flammable, it forms a safe, sealed, zero-loss loop.

2. The Speed Bridge: The Planetary CVT

    The Function: It acts as the intelligent translator between the screaming, high-RPM turbine and the generator.

    The Optimization: Because your thermal loop handles the heat dissipation, the CVT can continuously adjust its gear ratio. It lets the Novec-driven turbine spool up freely under low load, then shifts to lock the output shaft into the generator's ideal operational window.

3. The Generation End: Axial Flux Permanent Magnet Generator

    The Sweet Spot (3,000 to 5,000 RPM): The CVT steps down the turbine's velocity into this safe, high-torque zone.

    The Build: An axial flux generator with a coreless (air-core) stator and carbon-fiber-sleeved rotor magnets. This configuration completely eliminates iron-core cogging losses, handles the moderated RPM smoothly, and delivers clean, high-density multiphase AC power ready for rectification.

By locking Novec into a closed thermodynamic cycle to drive the bladeless turbine, and matching it with an optimized mechanical and electrical backend, you eliminate open-air inefficiencies and turn waste thermal energy into a clean, highly controlled electrical output.

Are you mapping out the fluid loop plumbing next, or focusing on the electrical rectification side of the generator output?

I'm only focusing on this part right here, the connection, the speed, those things. Everything else, I'm going to put them through simulations basically and calculations.

Got it—let's zero in strictly on the mechanical bridge: the speed matching, torque transfer, and connection dynamics between the turbine, the planetary CVT, and the axial generator.

When you set up your simulation and calculation models for this mechanical link, these are the core variables, relationships, and parameters you will want to account for:
1. Speed and Ratio Parameters

    Turbine Input Speed (ωin​): Set your boundary range for the Novec-driven turbine (e.g., 15,000 to 30,000 RPM).

    Generator Target Speed (ωout​): Lock the axial generator's operating window to its structural and electrical sweet spot (e.g., 3,000 to 5,000 RPM).

    Dynamic Ratio Range (R): The CVT ratio must dynamically sweep across a range of 3:1 up to 6:1 (or higher, depending on your peak turbine design).
    R=ωout​ωin​​

2. Torque and Power Transmission

    Torque Multiplication: Because energy is conserved (minus losses), stepping down the speed multiplies the torque delivered to the generator rotor.
    Tout​=Tin​×R×ηcvt​

    Mechanical Efficiency (ηcvt​): Since you are factoring in a planetary traction-drive CVT, plug an efficiency factor of roughly 0.80 to 0.88 into your calculations to simulate the internal slip and shear losses of the traction fluid.

    Transient Load and Inertia (J): Tesla turbines have very low rotational inertia in the discs themselves, but high rotational speed. Your simulation should model how quickly the CVT ratio can shift without causing the turbine to stall or overspeed the generator during sudden pressure spikes in the Novec loop.

3. Mechanical Interface & Connections

    Shaft Couplings: At speeds exceeding 15,000 RPM, standard rigid couplings will amplify minor angular misalignments into destructive vibration. Your simulation or physical design will need to account for high-speed flexible disc couplings or micro-bellows couplings between the turbine output and the CVT input.

    Bearing Loads (Radial & Thrust): Axial generators and high-speed turbines both produce distinct thrust loads. The planetary CVT's internal sun and planet gears will also experience high radial separation forces under heavy traction pressure, requiring high-speed ceramic hybrid bearings modeled for combined radial and axial loads.

Are you planning to build a custom physics model in software like MATLAB/Simulink or a CAD-based motion analysis tool to simulate these torque curves and speed sweeps?