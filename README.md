# GPU Fan Control Applet

This applet controls fan speed via `/sys/class/hwmon/hwmon2/pwm1`.  
It expects manual fan control to already be enabled.  
Check if the correct device is used by hovering on the applet (eg `hwmon name: amdgpu` for AMD GPUs).

[hwmon sysfs Reference](https://www.kernel.org/doc/Documentation/hwmon/sysfs-interface)  
[Cinnamon JS Reference Manual](http://lira.epac.to:8080/doc/cinnamon/cinnamon-js/)
